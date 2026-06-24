"""Read-only SQL chat tools — guarded text-to-SQL execution.

Defense-in-depth stack:
  Layer 0 (regex):   fast keyword/table scan on stripped SQL before parsing.
  Layer 1 (parse):   sqlglot rejects non-SELECT and write/DDL nodes, enforces
                     the table allowlist, and blocks system-catalog schemas
                     (information_schema / pg_catalog) before any DB call.
  Layer 2 (engine):  every query runs inside BEGIN TRANSACTION READ ONLY so
                     Postgres refuses any write even if Layers 0-1 are bypassed.
  Layer 3 (role):    when DATABASE_URL_READONLY points to a least-privilege
                     role, the DB grants make writes impossible at the
                     permission level regardless of layers 0-2.

Tenant isolation:
  When a property_id is available in AuditToolContext, scope-binding CTEs are
  automatically prepended to every query so the LLM cannot access another
  tenant's data even if it omits a WHERE filter.
"""
from __future__ import annotations

import logging
import re
from typing import Any

import sqlglot
import sqlglot.expressions as exp
from psycopg import Connection

from ....db._common import _sanitize_for_json
from ....db.pool import readonly_session
from ..context import AuditToolContext

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Allowlist: tables the LLM is permitted to SELECT from.
# Anything NOT in this set is rejected in Layer 1.
# This replaces the old denylist approach — new secret tables are safe by
# default because they won't appear here.
# ---------------------------------------------------------------------------
_ALLOWED_TABLES: frozenset[str] = frozenset({
    # Core crawl data
    "crawl_runs",
    "crawl_results",
    "crawl_page_html",
    "edges",
    "nodes",
    "link_edges",
    # Lighthouse
    "lighthouse_summary",
    "lighthouse_runs",
    "lighthouse_page_summaries",
    "lh_audits",
    "lh_audit_items",
    # Reports & analytics
    "report_payload",
    "google_data",
    "keyword_data",
    "keyword_history",
    "keyword_suggest_cache",
    "page_google_snapshots",
    "gsc_links_data",
    "gsc_links_snapshots",
    # Issue tracking & audit health
    "audit_health_snapshots",
    "issue_status",
    # CRuX, competitors, filters
    "crux_snapshots",
    "competitor_keyword_gap",
    "saved_crawl_filters",
    "log_file_uploads",
    # LLM response cache
    "llm_cache",
    # NOTE: `properties` is intentionally NOT allowlisted — it stores
    # google_refresh_token and other OAuth credentials (see property_store.py),
    # which must never be reachable from the chat SQL surface. It is also in
    # _SECRET_TABLES below as a belt-and-suspenders fast reject.
})

# ---------------------------------------------------------------------------
# Tenant-scoping maps
# Tables in these sets are automatically wrapped in scope-binding CTEs when
# ctx.property_id is available.
# ---------------------------------------------------------------------------

# Tables with a direct property_id column
_SCOPE_BY_PROPERTY_ID: frozenset[str] = frozenset({
    "google_data",
    "keyword_data",
    "gsc_links_data",
    "gsc_links_snapshots",
    "issue_status",
    "audit_health_snapshots",
    "crux_snapshots",
    "log_file_uploads",
    "competitor_keyword_gap",
    "saved_crawl_filters",
})

# Tables scoped through crawl_run_id → crawl_runs.property_id
_SCOPE_VIA_CRAWL_RUN: frozenset[str] = frozenset({
    "crawl_results",
    "crawl_page_html",
    "edges",
    "nodes",
    "link_edges",
})

# ---------------------------------------------------------------------------
# Blocked system-catalog schemas
# ---------------------------------------------------------------------------
_BLOCKED_SCHEMAS: frozenset[str] = frozenset({"information_schema", "pg_catalog"})

# ---------------------------------------------------------------------------
# Functions that perform side effects even inside a SELECT
# ---------------------------------------------------------------------------
_FORBIDDEN_FUNCTION_PATTERNS: tuple[str, ...] = (
    r"^pg_sleep$",
    r"^pg_read_file$",
    r"^pg_read_binary_file$",
    r"^pg_ls_dir$",
    r"^pg_terminate_backend$",
    r"^pg_cancel_backend$",
    r"^lo_",               # large-object manipulation
    r"^dblink",            # remote DB calls
    r"^dblink_exec$",
    r"^pg_exec$",
    # Advisory locks — NOT blocked by READ ONLY transactions; hold forever → DoS
    r"^pg_advisory_lock$",
    r"^pg_advisory_xact_lock$",
    r"^pg_advisory_lock_shared$",
    r"^pg_advisory_xact_lock_shared$",
    r"^pg_try_advisory_lock$",
    r"^pg_try_advisory_xact_lock$",
    r"^pg_try_advisory_lock_shared$",
    r"^pg_try_advisory_xact_lock_shared$",
    # Notification side-effects
    r"^pg_notify$",
    # Sequence mutation (also blocked by READ ONLY, but reject early)
    r"^nextval$",
    r"^setval$",
    r"^lastval$",
)

# Max rows returned to the LLM (configurable; default 200)
_DEFAULT_ROW_CAP = 200

# Maximum SQL length accepted before regex/AST parsing (16 KiB)
_MAX_SQL_BYTES = 16_384

# ---------------------------------------------------------------------------
# Layer 0 — regex pre-filter
# ---------------------------------------------------------------------------

# Patterns for stripping comments before keyword scanning.
_RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_RE_LINE_COMMENT = re.compile(r"--[^\r\n]*")
# Dollar-quoted strings — replace with empty so their content isn't scanned.
_RE_DOLLAR_QUOTE = re.compile(r"\$[^$]*\$.*?\$[^$]*\$", re.DOTALL)
# Single-quoted string literals — strip content so a keyword inside a
# string value (e.g. WHERE name = 'delete me') is not flagged.
_RE_STRING_LITERAL = re.compile(r"'(?:[^'\\]|\\.)*'")

_WRITE_KEYWORDS: tuple[str, ...] = (
    "insert", "update", "delete", "drop", "alter", "create", "truncate",
    "merge", "replace", "upsert",
    # transaction control
    "commit", "rollback", "savepoint", "begin",
    # file / system
    "copy", "vacuum", "analyze", "cluster", "reindex", "refresh",
    # privilege
    "grant", "revoke",
    # session mutation
    "set", "reset", "load", "listen", "unlisten", "notify",
    # locking
    "lock",
    # SELECT INTO new_table — creates a table (write)
    "into",
    # Postgres dangerous builtins referenced as bare words
    "pg_sleep", "pg_read_file", "pg_read_binary_file", "pg_ls_dir",
    "pg_terminate_backend", "pg_cancel_backend", "dblink",
    # Advisory locks — not blocked by READ ONLY transactions
    "pg_advisory_lock", "pg_advisory_xact_lock",
    "pg_advisory_lock_shared", "pg_advisory_xact_lock_shared",
    "pg_try_advisory_lock", "pg_try_advisory_xact_lock",
    # Side-effecting callables caught in Layer 0 as well
    "pg_notify", "nextval", "setval",
)

_WRITE_KW_RE: re.Pattern[str] = re.compile(
    r"\b(" + "|".join(re.escape(kw) for kw in _WRITE_KEYWORDS) + r")\b",
    re.IGNORECASE,
)

# Layer 0 still fast-rejects the known secret table names (belt+suspenders).
_SECRET_TABLES: frozenset[str] = frozenset({
    "llm_config",
    "google_app_settings",
    "pipeline_config",
    "chat_sessions",
    "chat_messages",
    "content_drafts",
    # Holds google_refresh_token / OAuth credentials — never queryable via chat.
    "properties",
})
_SECRET_TABLE_RE: re.Pattern[str] = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in sorted(_SECRET_TABLES)) + r")\b",
    re.IGNORECASE,
)


def _strip_sql_literals(sql: str) -> str:
    """Remove comments and string literal *content* so regex scans the tokens only."""
    sql = _RE_BLOCK_COMMENT.sub(" ", sql)
    sql = _RE_LINE_COMMENT.sub(" ", sql)
    sql = _RE_DOLLAR_QUOTE.sub(" '' ", sql)
    sql = _RE_STRING_LITERAL.sub("''", sql)
    return sql


def assert_read_only_regex(sql: str) -> None:
    """Layer 0: fast regex scan before sqlglot parsing.

    Strips comments and string literals then checks for:
    - Write/DDL/session-mutation keywords
    - Known secret table names

    This is a *belt* alongside the sqlglot *suspenders*.
    """
    stripped = _strip_sql_literals(sql)

    m = _WRITE_KW_RE.search(stripped)
    if m:
        raise ReadOnlyViolation(
            f"Forbidden keyword '{m.group(0)}' detected in query."
        )

    m = _SECRET_TABLE_RE.search(stripped)
    if m:
        raise ReadOnlyViolation(
            f"Table '{m.group(0)}' is not accessible via this tool."
        )


class ReadOnlyViolation(ValueError):
    """Raised when a SQL statement is not safe to run read-only."""


def _check_function_calls(ast: exp.Expression) -> None:
    """Reject SQL containing dangerous function calls."""
    for node in ast.walk():
        if isinstance(node, exp.Anonymous):
            name = str(node.this or "").lower()
        elif isinstance(node, exp.Func):
            name = type(node).__name__.lower()
        else:
            continue
        for pat in _FORBIDDEN_FUNCTION_PATTERNS:
            if re.match(pat, name):
                raise ReadOnlyViolation(
                    f"Function '{name}' is not permitted in read-only queries."
                )


def _collect_cte_names(ast: exp.Expression) -> frozenset[str]:
    """Return the lowercase alias names of all CTEs defined in the statement.

    These are virtual table names; they must not be checked against the
    base-table allowlist.
    """
    return frozenset(
        str(node.alias or "").lower()
        for node in ast.walk()
        if isinstance(node, exp.CTE)
    )


def _check_table_refs(ast: exp.Expression) -> None:
    """Enforce the table allowlist and block system-catalog schemas.

    CTE aliases defined within the same statement are excluded from the
    allowlist check since they are not real base-table references.
    """
    cte_names = _collect_cte_names(ast)

    for node in ast.walk():
        if not isinstance(node, exp.Table):
            continue

        table_name = str(node.this or "").lower().strip('"').strip("'")
        # node.db holds the schema qualifier (e.g. "information_schema" for
        # information_schema.tables); node.catalog holds the catalog prefix.
        schema_name = str(node.db or "").lower().strip('"').strip("'")
        catalog_name = str(node.catalog or "").lower().strip('"').strip("'")

        # Block system-catalog schemas — they leak metadata about denied tables.
        if schema_name in _BLOCKED_SCHEMAS:
            raise ReadOnlyViolation(
                f"Queries against '{schema_name}' are not permitted. "
                "Use the get_sql_schema tool to discover available tables."
            )

        # Reject every other schema/catalog qualifier. Tenant-scoping CTEs are
        # injected under the *unqualified* table name, and a Postgres CTE does
        # NOT shadow a schema-qualified reference — so `public.google_data`
        # resolves to the real base table and would bypass scope binding,
        # leaking every tenant's rows. All allowlisted tables live in the
        # default schema and must be referenced unqualified.
        if schema_name or catalog_name:
            qualified = ".".join(p for p in (catalog_name, schema_name, table_name) if p)
            raise ReadOnlyViolation(
                f"Schema-qualified table reference '{qualified}' is not permitted; "
                "reference tables by their unqualified name."
            )

        if not table_name:
            continue

        # Skip CTE alias references — they are virtual, not base tables.
        if table_name in cte_names:
            continue

        # Enforce allowlist — every base table must be explicitly permitted.
        if table_name not in _ALLOWED_TABLES:
            raise ReadOnlyViolation(
                f"Table '{table_name}' is not in the list of queryable tables. "
                "Call get_sql_schema to see available tables."
            )


def assert_read_only(sql: str) -> None:
    """Parse *sql* and raise ReadOnlyViolation if it is not a safe read-only SELECT.

    Checks (in order):
    0. SQL length cap: reject oversized inputs before expensive parsing.
    0. Regex pre-filter: no write/DDL keywords or secret table names.
    1. Exactly one statement (blocks ``SELECT 1; DROP TABLE x``).
    2. Top-level node is a SELECT / UNION / WITH wrapping a SELECT.
    3. Tree contains no write/DDL expression nodes.
    4. No dangerous side-effecting functions.
    5. Table allowlist: every referenced table must be in _ALLOWED_TABLES.
    6. No system-catalog schema references (information_schema, pg_catalog).
    """
    sql = sql.strip()
    if not sql:
        raise ReadOnlyViolation("SQL statement is empty.")

    # Length cap (before regex / AST to bound parse cost)
    if len(sql.encode()) > _MAX_SQL_BYTES:
        raise ReadOnlyViolation(
            f"SQL statement exceeds the {_MAX_SQL_BYTES // 1024} KiB size limit."
        )

    # Layer 0 — fast regex scan
    assert_read_only_regex(sql)

    try:
        statements = sqlglot.parse(sql, read="postgres", error_level=sqlglot.ErrorLevel.RAISE)
    except sqlglot.errors.ParseError as exc:
        raise ReadOnlyViolation(f"SQL parse error: {exc}") from exc

    if len(statements) != 1:
        raise ReadOnlyViolation(
            f"Only a single SQL statement is allowed; received {len(statements)}."
        )

    stmt = statements[0]
    if stmt is None:
        raise ReadOnlyViolation("SQL statement is empty after parsing.")

    # Allowed top-level node types
    _ALLOWED_TOP = (exp.Select, exp.Union, exp.Intersect, exp.Except, exp.With, exp.Subquery)
    if not isinstance(stmt, _ALLOWED_TOP):
        raise ReadOnlyViolation(
            f"Only SELECT queries are allowed; got '{type(stmt).__name__}'."
        )

    # Forbidden AST node types anywhere in the tree
    _FORBIDDEN_NODES = (
        exp.Insert,
        exp.Update,
        exp.Delete,
        exp.Drop,
        exp.Alter,
        exp.Create,
        exp.Command,
        exp.Merge,
        exp.TruncateTable,
        exp.Transaction,
        exp.Commit,
        exp.Rollback,
        exp.Use,
        exp.Set,
        exp.Copy,
        exp.Lock,
        exp.Into,
    )
    for node in stmt.walk():
        if isinstance(node, _FORBIDDEN_NODES):
            raise ReadOnlyViolation(
                f"Statement contains a forbidden operation: '{type(node).__name__}'."
            )

    # FOR UPDATE / FOR SHARE via locking reads
    for node in stmt.walk():
        if isinstance(node, exp.Select):
            if node.args.get("locks"):
                raise ReadOnlyViolation(
                    "SELECT ... FOR UPDATE / FOR SHARE is not permitted."
                )

    _check_function_calls(stmt)
    _check_table_refs(stmt)


# ---------------------------------------------------------------------------
# Tenant scoping helpers
# ---------------------------------------------------------------------------

def _extract_referenced_tables(stmt: exp.Expression) -> set[str]:
    """Return the set of lowercase base table names referenced in the statement.

    CTE aliases are excluded because they are virtual names, not real tables.
    """
    cte_names = _collect_cte_names(stmt)
    return {
        name
        for node in stmt.walk()
        if isinstance(node, exp.Table)
        for name in (str(node.this or "").lower().strip('"').strip("'"),)
        if name and name not in cte_names
    }


def _get_user_cte_names(stmt: exp.Expression) -> set[str]:
    """Return the names of all CTEs defined anywhere in the statement (lowercase).

    Uses ast.walk() because the top-level node from sqlglot is exp.Select
    (with a nested exp.With), not exp.With itself.
    """
    return _collect_cte_names(stmt)


def _inject_scope_ctes(sql: str, stmt: exp.Expression, property_id: int) -> str:
    """Prepend tenant-scoping CTEs for all property-bound tables in the query.

    Tables in _SCOPE_BY_PROPERTY_ID are wrapped:
        tbl AS (SELECT * FROM tbl WHERE property_id = <property_id>)

    Tables in _SCOPE_VIA_CRAWL_RUN are wrapped through crawl_runs:
        crawl_runs AS (SELECT * FROM crawl_runs WHERE property_id = <property_id>)
        tbl AS (SELECT t.* FROM tbl t
                WHERE t.crawl_run_id IN (SELECT id FROM crawl_runs))

    Raises ReadOnlyViolation when a user CTE name shadows any scopable table
    (an attacker could use such a CTE to bypass the scope bindings).
    """
    _ALL_SCOPABLE: frozenset[str] = _SCOPE_BY_PROPERTY_ID | _SCOPE_VIA_CRAWL_RUN | {"crawl_runs"}

    # Guard: reject upfront if any user CTE alias shadows a scopable table name.
    # This prevents bypass via e.g. WITH crawl_runs AS (SELECT * FROM crawl_runs).
    user_cte_names = _get_user_cte_names(stmt)
    cte_conflicts = _ALL_SCOPABLE & user_cte_names
    if cte_conflicts:
        raise ReadOnlyViolation(
            f"CTE name(s) {sorted(cte_conflicts)!r} conflict with mandatory scope "
            "bindings. Rename your CTEs to avoid these names."
        )

    referenced = _extract_referenced_tables(stmt)

    need_property_tables = _SCOPE_BY_PROPERTY_ID & referenced
    need_crawl_run_tables = _SCOPE_VIA_CRAWL_RUN & referenced
    need_crawl_runs_direct = "crawl_runs" in referenced
    # We always emit a crawl_runs CTE when any child table is referenced,
    # even if the user did not reference crawl_runs directly.
    need_crawl_runs_cte = need_crawl_runs_direct or bool(need_crawl_run_tables)

    if not need_property_tables and not need_crawl_run_tables and not need_crawl_runs_direct:
        return sql  # Nothing to scope

    pid = int(property_id)

    ctes: list[str] = []

    # crawl_runs scope (covers both direct reference and child-table parent)
    if need_crawl_runs_cte:
        ctes.append(
            f"crawl_runs AS "
            f"(SELECT * FROM crawl_runs WHERE property_id = {pid})"
        )

    # Child tables scoped through the crawl_runs CTE above
    for tbl in sorted(need_crawl_run_tables):
        ctes.append(
            f"{tbl} AS "
            f"(SELECT t.* FROM {tbl} t "
            f"WHERE t.crawl_run_id IN (SELECT id FROM crawl_runs))"
        )

    # Tables with a direct property_id column
    for tbl in sorted(need_property_tables):
        ctes.append(
            f"{tbl} AS "
            f"(SELECT * FROM {tbl} WHERE property_id = {pid})"
        )

    cte_block = ",\n".join(ctes)

    # Merge with any existing WITH clause (regex-based, because sqlglot parses
    # WITH ... SELECT as exp.Select with a nested exp.With, not exp.With itself).
    stripped = sql.strip()
    if re.match(r"(?i)^WITH\s+RECURSIVE\b", stripped):
        # A WITH RECURSIVE query cannot simply absorb our non-recursive scope
        # CTEs: they self-shadow their base tables (e.g.
        # `crawl_runs AS (SELECT * FROM crawl_runs ...)`), which Postgres would
        # mis-read as a malformed recursive term and reject. Wrap the whole
        # query in a subquery instead — the outer scope CTEs remain visible
        # inside it, so the user's table references still resolve to the scoped
        # CTEs while the recursive CTE keeps its required `WITH RECURSIVE` form.
        return f"WITH {cte_block}\nSELECT * FROM (\n{stripped}\n) _scoped"
    if re.match(r"(?i)^WITH\s", stripped):
        return re.sub(
            r"(?i)^\s*WITH\s+",
            f"WITH {cte_block},\n",
            stripped,
            count=1,
        )
    return f"WITH {cte_block}\n{stripped}"


# ---------------------------------------------------------------------------
# Tool handlers
# ---------------------------------------------------------------------------

def run_sql_query(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Execute a user-supplied read-only SELECT and return rows as JSON.

    The *conn* argument (injected by the tool dispatcher) is used only to
    resolve the active property scope; the actual query runs on a dedicated
    readonly_session so the read-only transaction wrapper is guaranteed.
    """
    sql = str(args.get("sql") or "").strip()
    if not sql:
        return {"error": "sql argument is required."}

    row_cap: int
    try:
        row_cap = max(1, min(int(args.get("row_cap") or _DEFAULT_ROW_CAP), 500))
    except (TypeError, ValueError):
        row_cap = _DEFAULT_ROW_CAP

    # Layer 1 — parse-based validation (includes length cap + Layer 0 regex)
    try:
        assert_read_only(sql)
    except ReadOnlyViolation as exc:
        return {"error": f"Query rejected: {exc}"}

    # Re-parse to get the AST for scope injection (parse already validated above)
    try:
        stmts = sqlglot.parse(sql, read="postgres")
        stmt = stmts[0] if stmts else None
    except Exception:  # noqa: BLE001
        stmt = None

    # Tenant scoping: inject property-bound CTEs when a property is in context.
    if stmt is not None and ctx.property_id is not None:
        try:
            sql = _inject_scope_ctes(sql, stmt, ctx.property_id)
        except ReadOnlyViolation as exc:
            return {"error": f"Query rejected: {exc}"}

    # Wrap with an outer LIMIT (row_cap + 1) so we can detect truncation
    # without under-counting: if > row_cap rows come back, data was cut.
    wrapped = f"SELECT * FROM ({sql}) _q LIMIT {row_cap + 1}"

    # Layer 2 — read-only transaction (Postgres rejects any write)
    try:
        with readonly_session() as ro_conn:
            with ro_conn.cursor() as cur:
                cur.execute(wrapped)
                raw_rows = cur.fetchall()
                columns = [desc[0] for desc in cur.description] if cur.description else []
    except Exception as exc:  # noqa: BLE001
        logger.exception("run_sql_query DB error (property_id=%s)", ctx.property_id)
        return {"error": "Query execution failed. Check your SQL syntax and column references."}

    truncated = len(raw_rows) > row_cap
    raw_rows = raw_rows[:row_cap]

    rows = [
        dict(zip(columns, _sanitize_for_json(list(row.values() if isinstance(row, dict) else row))))
        for row in raw_rows
    ]

    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "truncated": truncated,
    }


# ---------------------------------------------------------------------------
# Schema discovery
# ---------------------------------------------------------------------------

def get_sql_schema(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Return the public schema: allowlisted tables, their columns, and foreign keys.

    This lets the LLM write accurate SQL before calling run_sql_query.
    Tables outside the allowlist are excluded from the output.
    """
    col_query = """
        SELECT
            t.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable,
            tc.constraint_type
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON c.table_name = t.table_name
         AND c.table_schema = t.table_schema
        LEFT JOIN information_schema.key_column_usage kcu
          ON kcu.table_name = c.table_name
         AND kcu.column_name = c.column_name
         AND kcu.table_schema = c.table_schema
        LEFT JOIN information_schema.table_constraints tc
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.constraint_type = 'PRIMARY KEY'
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
    """
    fk_query = """
        SELECT
            kcu.table_name,
            kcu.column_name,
            ccu.table_name  AS foreign_table,
            ccu.column_name AS foreign_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name
         AND kcu.table_schema    = tc.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
         AND ccu.table_schema    = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema    = 'public'
        ORDER BY kcu.table_name, kcu.column_name
    """
    try:
        with readonly_session() as ro_conn:
            with ro_conn.cursor() as cur:
                cur.execute(col_query)
                col_rows = cur.fetchall()
                cur.execute(fk_query)
                fk_rows = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        logger.exception("get_sql_schema DB error (property_id=%s)", ctx.property_id)
        return {"error": "Schema query failed. The database may be unavailable."}

    # Build column map, filtered to the allowlist
    tables: dict[str, list[dict[str, Any]]] = {}
    for row in col_rows:
        if isinstance(row, dict):
            tname = str(row.get("table_name") or "")
            col: dict[str, Any] = {
                "column": str(row.get("column_name") or ""),
                "type": str(row.get("data_type") or ""),
                "nullable": str(row.get("is_nullable") or "YES") == "YES",
                "primary_key": row.get("constraint_type") == "PRIMARY KEY",
            }
        else:
            tname = str(row[0])
            col = {
                "column": str(row[1]),
                "type": str(row[2]),
                "nullable": str(row[3]) == "YES",
                "primary_key": row[4] == "PRIMARY KEY",
            }

        if tname.lower() not in _ALLOWED_TABLES:
            continue
        tables.setdefault(tname, []).append(col)

    # Build foreign-key map
    fk_map: dict[str, list[dict[str, str]]] = {}
    for row in fk_rows:
        if isinstance(row, dict):
            tname = str(row.get("table_name") or "")
            fk: dict[str, str] = {
                "column": str(row.get("column_name") or ""),
                "references_table": str(row.get("foreign_table") or ""),
                "references_column": str(row.get("foreign_column") or ""),
            }
        else:
            tname = str(row[0])
            fk = {
                "column": str(row[1]),
                "references_table": str(row[2]),
                "references_column": str(row[3]),
            }

        if tname.lower() not in _ALLOWED_TABLES:
            continue
        fk_map.setdefault(tname, []).append(fk)

    return {
        "tables": [
            {
                "table": tname,
                "columns": cols,
                "foreign_keys": fk_map.get(tname, []),
            }
            for tname, cols in sorted(tables.items())
        ],
        "allowlisted_tables_only": True,
        "note": (
            "Use run_sql_query with a single read-only SELECT. "
            "No INSERT/UPDATE/DELETE/DDL is allowed. "
            "Scope queries to the active property using the injected filters."
        ),
    }
