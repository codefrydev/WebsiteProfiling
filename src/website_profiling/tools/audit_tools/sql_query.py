"""Read-only SQL chat tools — guarded text-to-SQL execution.

Defense-in-depth stack:
  Layer 0 (regex):   fast keyword/table scan on stripped SQL before parsing.
  Layer 1 (parse):   sqlglot rejects non-SELECT and write/DDL nodes before
                     any DB call is made.
  Layer 2 (engine):  every query runs inside BEGIN TRANSACTION READ ONLY so
                     Postgres refuses any write even if Layers 0-1 are bypassed.
  Layer 3 (role):    when DATABASE_URL_READONLY points to a least-privilege
                     role, the DB grants make writes impossible at the
                     permission level regardless of layers 0-2.
"""
from __future__ import annotations

import re
from typing import Any

import sqlglot
import sqlglot.expressions as exp
from psycopg import Connection

from ...db._common import _sanitize_for_json
from ...db.pool import readonly_session
from .context import AuditToolContext

# ---------------------------------------------------------------------------
# Tables the LLM must never be allowed to SELECT from — contains secrets or
# private data.  Any query that references one of these is rejected in Layer 0
# and Layer 1 even though Layer 2/3 would also block writes.
# ---------------------------------------------------------------------------
_DENIED_TABLES: frozenset[str] = frozenset({
    "llm_config",          # LLM provider API keys
    "google_app_settings", # OAuth client id/secret
    "pipeline_config",     # arbitrary user-supplied env / secrets
    "chat_sessions",       # user chat privacy
    "chat_messages",       # user chat privacy
    "content_drafts",      # user-authored content privacy
})

# Functions that perform side effects even inside a SELECT
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

# ---------------------------------------------------------------------------
# Layer 0 — regex pre-filter
# ---------------------------------------------------------------------------

# Patterns for stripping comments before keyword scanning.
# Order matters: block comments first, then line comments.
_RE_BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.DOTALL)
_RE_LINE_COMMENT = re.compile(r"--[^\r\n]*")
# Dollar-quoted strings ($$...$$  or  $tag$...$tag$) — replace with empty
# so their content isn't scanned for keywords.
_RE_DOLLAR_QUOTE = re.compile(r"\$[^$]*\$.*?\$[^$]*\$", re.DOTALL)
# Single-quoted string literals — strip content so a keyword inside a
# string value (e.g. WHERE name = 'delete me') is not flagged.
_RE_STRING_LITERAL = re.compile(r"'(?:[^'\\]|\\.)*'")

# Write/DDL keywords that should never appear at the token level.
# Using word-boundary anchors so "updates" in a column alias doesn't trigger.
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
    # SELECT INTO new_table — creates a table (write); must come after stripping literals
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

# Denied table names as whole words (case-insensitive).
_DENIED_TABLE_RE: re.Pattern[str] = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in sorted(_DENIED_TABLES)) + r")\b",
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
    - Denied table names

    This is a *belt* alongside the sqlglot *suspenders*.  The regex is
    intentionally strict (it bans ``BEGIN`` too), which means an attacker
    cannot use obfuscation tricks (e.g. inline comments between keyword letters
    at the token level) to sneak a write past both layers simultaneously.
    """
    stripped = _strip_sql_literals(sql)

    m = _WRITE_KW_RE.search(stripped)
    if m:
        raise ReadOnlyViolation(
            f"Forbidden keyword '{m.group(0)}' detected in query."
        )

    m = _DENIED_TABLE_RE.search(stripped)
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


def _check_table_refs(ast: exp.Expression) -> None:
    """Reject queries that reference denied tables."""
    for node in ast.walk():
        if isinstance(node, exp.Table):
            table_name = str(node.this or "").lower().strip('"').strip("'")
            if table_name in _DENIED_TABLES:
                raise ReadOnlyViolation(
                    f"Table '{table_name}' is not accessible via this tool."
                )


def assert_read_only(sql: str) -> None:
    """Parse *sql* and raise ReadOnlyViolation if it is not a safe read-only SELECT.

    Checks (in order):
    0. Regex pre-filter: no write/DDL keywords or denied table names in token stream.
    1. Exactly one statement (blocks ``SELECT 1; DROP TABLE x``).
    2. Top-level node is a SELECT / UNION / WITH wrapping a SELECT.
    3. Tree contains no write/DDL expression nodes.
    4. No dangerous side-effecting functions.
    5. No references to denied tables.
    """
    sql = sql.strip()
    if not sql:
        raise ReadOnlyViolation("SQL statement is empty.")

    # Layer 0 — fast regex scan (runs before the parser)
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
        exp.Transaction,   # blocks embedded BEGIN/COMMIT/ROLLBACK
        exp.Commit,
        exp.Rollback,
        exp.Use,           # USE <database> / SET search_path
        exp.Set,           # SET <variable> = ...
        exp.Copy,          # COPY ... TO / FROM
        exp.Lock,          # SELECT ... FOR UPDATE / FOR SHARE
        exp.Into,          # SELECT ... INTO new_table (creates a table)
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
# Tool handlers
# ---------------------------------------------------------------------------

def run_sql_query(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Execute a user-supplied read-only SELECT and return rows as JSON.

    The *conn* argument (injected by the tool dispatcher) is intentionally
    ignored; we always open a dedicated readonly_session so the read-only
    transaction wrapper is guaranteed regardless of what connection the caller
    holds.
    """
    _ = conn  # unused — readonly_session() opens its own connection
    sql = str(args.get("sql") or "").strip()
    if not sql:
        return {"error": "sql argument is required."}

    row_cap: int
    try:
        row_cap = max(1, min(int(args.get("row_cap") or _DEFAULT_ROW_CAP), 500))
    except (TypeError, ValueError):
        row_cap = _DEFAULT_ROW_CAP

    # Layer 1 — parse-based validation
    try:
        assert_read_only(sql)
    except ReadOnlyViolation as exc:
        return {"error": f"Query rejected: {exc}"}

    # Wrap with an outer LIMIT so the user cannot pull unlimited rows
    # even if they write LIMIT 99999 inside their own query.  We cap
    # by selecting from the user query as a sub-select.
    wrapped = f"SELECT * FROM ({sql}) _q LIMIT {row_cap}"

    # Layer 2 — read-only transaction (Postgres rejects any write)
    try:
        with readonly_session() as ro_conn:
            with ro_conn.cursor() as cur:
                cur.execute(wrapped)
                raw_rows = cur.fetchall()
                columns = [desc[0] for desc in cur.description] if cur.description else []
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc).strip() or type(exc).__name__}

    rows = [
        dict(zip(columns, _sanitize_for_json(list(row.values() if isinstance(row, dict) else row))))
        for row in raw_rows
    ]

    return {
        "columns": columns,
        "rows": rows,
        "row_count": len(rows),
        "truncated": len(rows) >= row_cap,
    }


# Tables exposed via get_sql_schema — excludes denied tables so the LLM
# cannot even learn their column names.
def get_sql_schema(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Return the public schema: allowlisted tables and their columns.

    This lets the LLM write accurate SQL before calling run_sql_query.
    Denied (secret) tables are excluded from the output.
    """
    query = """
        SELECT
            t.table_name,
            c.column_name,
            c.data_type,
            c.is_nullable
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON c.table_name = t.table_name
         AND c.table_schema = t.table_schema
        WHERE t.table_schema = 'public'
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
    """
    try:
        with readonly_session() as ro_conn:
            with ro_conn.cursor() as cur:
                cur.execute(query)
                raw = cur.fetchall()
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc).strip() or type(exc).__name__}

    tables: dict[str, list[dict[str, str]]] = {}
    for row in raw:
        if isinstance(row, dict):
            tname = str(row.get("table_name") or "")
            col = {
                "column": str(row.get("column_name") or ""),
                "type": str(row.get("data_type") or ""),
                "nullable": str(row.get("is_nullable") or "YES") == "YES",
            }
        else:
            tname = str(row[0])
            col = {"column": str(row[1]), "type": str(row[2]), "nullable": str(row[3]) == "YES"}

        if tname.lower() in _DENIED_TABLES:
            continue
        tables.setdefault(tname, []).append(col)

    return {
        "tables": [
            {"table": tname, "columns": cols}
            for tname, cols in sorted(tables.items())
        ],
        "denied_tables_excluded": True,
        "note": "Use run_sql_query with a single read-only SELECT. No INSERT/UPDATE/DELETE/DDL is allowed.",
    }
