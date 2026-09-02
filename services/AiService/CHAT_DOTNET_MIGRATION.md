# Chat .NET Migration — Audit Tool Bridge Retirement

Tracks porting all Python `audit_tools` tools to native C# handlers in AiService, so
`ToolDispatcher` never needs `PythonToolBridgeClient` (`{FASTAPI_URL}/api/report/audit-tool`), and
then deleting the Python `tools/audit_tools/` package + the FastAPI route entirely.

See the plan this was seeded from for full context: batching rationale, per-domain porting
workflow, test strategy, and retirement sequencing (chat_dotnet_migration / auth-threat-model /
dotnet-bff-gateway memory topics if using an assistant with persistent memory on this repo).

**How to update this file**: after porting a domain, re-run the diff below and update its row.
Domain names here are the *Python metadata domain* (`tools_catalog_by_domain()` in
`src/website_profiling/tools/audit_tools/registry.py`), which does **not** always match the C#
`Handlers/{Domain}/` folder name 1:1 — e.g. `list_pages_without_schema` lives in C#'s
`SchemaToolHandlers` but Python doesn't classify it under the `schema` domain. Always diff by tool
*name*, not by folder, before assuming a domain's remaining count:

```bash
# 1. Dump currently-registered native tool names (add a temporary xunit test that calls
#    ToolRegistryExtensions.CreateToolRegistry(provider).RegisteredToolNames and writes them to a
#    file, `dotnet test --filter <TestName>`, then delete the temporary test).
# 2. Diff against the Python catalog:
source .venv/bin/activate && cd src && python3 -c "
from website_profiling.tools.audit_tools.registry import tools_catalog_by_domain
native = set(open('/path/to/registered_tool_names.txt').read().split())
cat = tools_catalog_by_domain()
for domain in sorted(cat):
    remaining = sorted(set(cat[domain]) - native)
    print(domain, len(cat[domain]), 'remaining:', remaining)
"
```

## Status (measured 2026-07-03, updated same day after artifact + keywords + drift + geo batches)

Total catalog: 369 tools. Native: 195 registered (~53%). Four domains fully done; `keywords`, `drift`
each at one tool remaining; `geo` at 27/41.

| Domain | Total | Native | Remaining | Status |
|---|---|---|---|---|
| export | 5 | 5 | 0 | done |
| insight | 5 | 5 | 0 | done |
| schema | 3 | 3 | 0 | done |
| security | 3 | 3 | 0 | done |
| drift | 26 | 25 | 1 | partial — only `get_integration_alerts` left (separate alerts subsystem: SMTP/webhook dispatch + an all-properties GROUP BY scan, `tools/alert_checker.py::check_all_alerts`); deferred, not a report-compare tool |
| keywords | 34 | 33 | 1 | partial — only `expand_keywords` left (Google Suggest expansion: external HTTP calls + its own Postgres cache table, `integrations/google/suggest.py::batch_expand`); deferred as a separate integration-style port, not a payload filter |
| geo | 41 | 27 | 14 | partial — all 14 are the "agent readiness" cluster: `generate_agent_readiness_bundle`, `get_agent_permissions_status`, `get_agent_readiness_score`, `get_agents_md_status`, `get_content_structure_aeo_summary`, `get_copy_for_ai_signals`, `get_markdown_availability_summary`, `get_skill_md_status`, `get_token_budget_summary`, `list_oversized_pages_for_agents`, `list_pages_agent_unfriendly`, `list_pages_missing_copy_for_ai` (all in `geo/agent_readiness.py`, need NEW live-fetch helpers for agents.md/skill.md/agent-permissions/markdown-sibling-probing — a distinct sub-feature from what's already in `GeoAuditHelpers`), plus `list_pages_missing_article_schema` (lives in `content/content_lists.py`) and `check_ai_citation_presence` (lives in `integrations/integration_tools.py`) |
| core | 9 | 7 | 2 | partial |
| ctr | 3 | 2 | 1 | partial |
| backlinks | 9 | 4 | 5 | partial |
| indexation | 12 | 5 | 7 | partial |
| performance | 15 | 8 | 7 | partial |
| content | 13 | 7 | 6 | partial |
| issues | 19 | 10 | 9 | partial |
| links | 25 | 15 | 10 | partial |
| google | 33 | 14 | 19 | partial |
| portfolio | 29 | 15 | 14 | partial |
| crawl | 33 | 6 | 27 | partial |
| accessibility | 5 | 0 | 5 | not started |
| assets | 5 | 0 | 5 | not started |
| images | 8 | 0 | 8 | not started |
| integrations | 4 | 0 | 4 | not started |
| onpage | 20 | 0 | 20 | not started |
| ops | 10 | 0 | 10 | not started |

(1 native tool name doesn't map to any Python domain in `tools_catalog_by_domain()` — likely a
naming mismatch worth a quick look next time this table is regenerated, not urgent.)

Note: the original migration plan estimated domain sizes from directory names before this measured
baseline existed (e.g. guessed `geo`=64, `crawl`=62, `keywords`=50, and a `tech` domain that turned
out not to exist in the real tool-metadata taxonomy — those 2 tools are actually classified under
`drift`/`crawl`). Trust this table, not those earlier estimates.

## Done this session (Batch 1 + artifact subsystem)

- `schema`: added `get_seo_health`, `list_schema_errors_by_type` (domain now 3/3, done).
  `security` was already 3/3 done — no work needed, contrary to the original plan's assumption.
- `export`: now 5/5, done. `list_export_formats` needed no dependencies. The other 4
  (`export_audit_report`, `export_compare_csv`, `export_list_as_csv`, `export_sitemap_xml`) all
  needed the artifact subsystem below.
- **Artifact subsystem ported**: `AiService.Tools.Artifacts.ArtifactStore`
  (`services/AiService/src/AiService.Tools/Artifacts/ArtifactStore.cs`) ports Python's
  `export_artifacts.py` 1:1 — same on-disk format (`DATA_DIR/exports/{uuid}.meta.json` + `.bin`,
  24h TTL sweep, `download_path: /api/chat/artifacts/{id}`), plus `RowsFromToolResult`/`DictsToCsv`
  helpers. `ChatController.GetArtifact` now reads natively instead of proxying to Python (its
  `IHttpClientFactory`/`FastApiOptions` dependencies were removed — check before re-adding).
  **Finding**: the Python `/api/chat/artifacts/{id}` FastAPI route this used to proxy to doesn't
  exist anywhere in the current codebase (`read_artifact_bytes` had zero callers) — the old proxy
  was already dead. This port fixes the feature rather than just relocating it.
- `export_audit_report`'s PDF/CSV/JSON paths call .NET **CoreService**'s existing
  `v1/reports/{id}/{pdf,csv,json}` endpoints (`services/CoreService/src/CoreService.Api/Controllers/ReportExportController.cs`)
  via a new `DataServiceClient` (`services/AiService/src/AiService.Api/Tools/Bridge/DataServiceClient.cs`,
  env `CORE_SERVICE_URL` / `DATA_SERVICE_URL`) — reuses CoreService's canonical export implementation rather than
  re-porting Python's bespoke CSV column layout (`export_audit.py`/`export_audit_data.py` were NOT
  ported; CoreService's version is now the one true implementation).
- `export_list_as_csv` recursively calls back into `ToolDispatcher.DispatchAsync` (its own allowlisted
  target tool may be native or still Python-bridged — dispatch handles both transparently). Verified
  no circular-DI issue: `ToolDispatcher`/`DataServiceClient` are resolved *lazily inside* the
  `InjectingToolHandler` lambda (at actual call time), not eagerly during `ToolHandlerModules`
  registration — eager resolution would deadlock since `ToolDispatcher` itself depends on
  `ToolRegistry`, which is what's being built during registration.
- Housekeeping: deleted orphaned Python chat files (`db/chat_store.py`, `commands/chat_cmd.py`,
  `api/schemas/chat.py`) and their references in `cli.py`/`storage.py`/`config_resolve.py`. Note:
  `chat_cmd.py` was *not* actually dead code as originally assumed — it was live-wired as the
  `chat` CLI subcommand's redirect-to-.NET stub. Removed the subcommand entirely (argparse choice +
  dispatch branch) rather than leaving a dangling import.
- Tests: `services/AiService/tests/AiService.Tests/Handlers/ArtifactStoreTests.cs` and
  `ExportToolHandlerTests.cs` (147 total tests passing, up from 131). The latter builds a real
  `ToolDispatcher` with an in-memory `IDbContextFactory` to test the recursive-dispatch path
  end-to-end without needing Postgres — see `BuildDispatcher`/`InMemoryDbContextFactory` for the
  pattern if testing other handlers that need a live `ToolDispatcher`.

## Done this session (continued): keywords domain

- Ported 32 of the 33 remaining `keywords` tools to
  `services/AiService/src/AiService.Tools/Handlers/Keywords/KeywordsToolHandlers.cs`, registered via
  a new `KeywordsModule()` in `ToolHandlerModules.cs`. `expand_keywords` deferred (see table above).
- Added two loaders to `AuditToolContext.cs`: `LoadKeywordSnapshotPairAsync` (current + prior
  `keyword_data` snapshot, mirrors Python's `_load_keyword_pair` — current is capped via
  `LoadKeywordsAsync`, prior is a raw uncapped read, matching Python's asymmetry) and
  `LoadKeywordHistoryAsync` (new `keyword_history` table/`KeywordHistoryRow` entity added to
  `AuditToolsDbContext.cs` — didn't exist in C# before this). Also added the missing `FetchedAt`
  column mapping to `KeywordDataRow` (was present in Postgres, unmapped in EF Core).
- **Found and fixed a latent bug in the shared `JsonCoercion.Num`/`AsDouble`**
  (`services/Shared/WebsiteProfiling.Contracts/Json/JsonCoercion.cs`): it only tried
  `JsonValue.TryGetValue<double>()`, which fails for a `JsonValue` constructed directly from a raw
  CLR `int`/`long` (e.g. `JsonValue.Create(5)` or a C# object initializer `["x"] = 5`) — only
  JSON-text-parsed (`JsonElement`-backed) numeric nodes widened correctly. This is a real robustness
  gap, not just a test artifact: anything that builds args programmatically (e.g. `export_list_as_csv`
  setting `toolArgs["limit"] = limit`) could silently get 0 downstream instead of the real value if
  the receiving handler used `JsonCoercion.Num`. Fixed by also trying `TryGetValue<long>`/`<int>`
  before falling back to string parsing — mirrors the more defensive pattern `PayloadSliceHelpers.ParseLimit`
  already used. If you see a handler mysteriously getting 0 for a numeric arg, check whether it's
  going through `Num`/`AsDouble` on a non-JSON-parsed value; this should now be fixed but is worth
  remembering as a class of bug.
- Deliberately normalized Python's two near-duplicate "property_id missing" error shapes
  (`keywords.py` vs `keyword_lists.py` — different wording, one has a `"missing"` key, one doesn't)
  to one consistent shape per return type in the C# port, rather than replicate the incidental
  drift. Documented here in case exact string parity is ever needed for some caller.
- Test gotcha worth remembering: `LoadKeywordsAsync`/`ReadKeywordSnapshotAsync` treat the **highest
  `Id`** in `keyword_data` as "current" and the next-highest as "prior" — seed test rows with that
  in mind (id ordering, not insertion order or narrative order).
- Fixed test flakiness: `ArtifactStoreTests` and `ExportToolHandlerTests` both mutate the
  process-wide `DATA_DIR` env var in their constructor/`Dispose()`; xUnit runs different test
  classes in parallel by default, so they could race. Both now share `[Collection("DATA_DIR env
  var")]` to force sequential execution relative to each other. Any *new* test class that also
  touches `DATA_DIR` must join this same collection.
- Tests: `KeywordsToolHandlerTests.cs` (26 tests). Full suite: 173 passed (up from 147), verified
  stable across repeated runs (not flaky) after the collection fix above.

## Done this session (continued): drift domain (report compare)

- Ported 24 of the remaining `drift` tools (all of Python's `compare/compare_slices.py`,
  `compare/compare.py::compare_reports`, `compare/compare_list_tools.py`, and
  `portfolio/health.py::get_health_history`) — domain now 25/26.
- Ported the ~18 pure diffing functions from `reporting/compare_payload.py` (648 lines) to
  `services/AiService/src/AiService.Tools/Compare/CompareHelpers.cs` — `BuildIssueDeltas`,
  `BuildLighthouseUrlDeltas`, `BuildLinkMetricDeltas`, `BuildRedirectDeltas`, `BuildSecurityDeltas`,
  `BuildDuplicateDeltas`, `BuildTechDeltas`, `BuildContentMetrics`, `BuildGoogleMetrics`,
  `BuildSeoHealthDeltas`, `BuildCategoryScores`, `BuildUrlSetDiff`, `BuildIndexationDeltas`,
  `BuildOrphanDeltas`, `BuildPriorityCounts`, `ScoreFromCategories`/`RoundHalfUp`, and
  `BuildFullCompare` (the orchestrator — trivial once the rest exist, since it just composes them;
  don't defer an "orchestrator" tool if you already have to build all its pieces anyway).
- Added `AuditToolContext.LoadComparePairAsync` (current + baseline report payload pair, mirrors
  Python's `compare_helpers.load_compare_pair`) and refactored `ExportToolHandlers.ExportCompareCsvAsync`
  (from the export-domain session) to reuse it instead of its own inlined duplicate — same logic was
  needed in both places.
- Added the missing `category_scores` (jsonb) column mapping to `AuditHealthSnapshotRow` — the table
  already existed in `AuditToolsDbContext.cs` for `AuditHealthSnapshots` but that column wasn't
  mapped yet (needed for `get_health_history`).
- Reused `GoogleToolHandlers.GscRows` (made `public`, was `private`) for `list_compare_traffic_losers`
  instead of re-deriving GSC row extraction — same `gsc_full`/`gsc`/`top_{key}` resolution logic
  already existed there for the `google` domain's already-ported tools.
- Deferred `compare_geo_score_deltas` — turned out to be classified under the **`geo`** domain, not
  `drift` (despite the name), so it wasn't actually in this batch's scope at all; it does live HTTP
  GEO-readiness checks (10 concurrent requests) and belongs with the `geo` domain work instead.
  Deferred `get_integration_alerts` deliberately — it's a separate alerts subsystem (SMTP email +
  webhook dispatch, plus an all-properties `LEFT JOIN ... GROUP BY` staleness scan), not a
  report-compare tool despite being classified under `drift`.
- Tests: `CompareHelpersTests.cs` (26 tests covering all ported build functions) and
  `DriftToolHandlerTests.cs` (13 handler-level tests). Full suite: 212 passed (up from 173),
  verified stable across 3 repeated runs.

## Done this session (continued): geo domain (AEO/GEO detectors, citability, robots/llms lists)

- Ported 14 of the remaining `geo` tools — domain now 27/41:
  - `geo/geo_detectors.py` (6 tools, all pure crawl-payload regex analysis, no HTTP) →
    `services/AiService/src/AiService.Tools/Handlers/Geo/GeoDetectorsToolHandlers.cs`:
    `get_negative_signals`, `detect_prompt_injection`, `get_rag_chunk_readiness`,
    `get_content_decay_signals`, `get_multimodal_readiness`, `get_topic_authority` (TF-IDF cosine
    clustering, ported faithfully including the O(n²) `_MAX_CLUSTER_DOCS`=200 cap).
  - `geo/geo_citability.py` (2 tools) → `GeoCitabilityToolHandlers.cs`: `get_citability_score`,
    `get_citability_for_url`. Needed a new `ReadingLevel.cs` port of
    `content_analysis/reading_level.py` (`CountSyllables`/`SplitSentences`/`FleschKincaidGrade`) —
    didn't exist in C# before this, small self-contained algorithm, no external deps.
  - `geo/geo_list_tools.py` (5 tools) → `GeoListToolHandlers.cs`: `get_robots_ai_access_score`,
    `list_pages_missing_howto_schema`, `list_pages_ai_citation_signals`,
    `list_pages_missing_llms_txt_reference`, `list_robots_blocked_ai_crawlers`. Reused existing
    `GeoAuditHelpers.ScoreRobotsAiAccessAsync`/`ParseRobotsAccess`/`FetchLlmsTxtAsync`/`AiBotTiers`
    instead of re-deriving robots.txt/llms.txt fetch+parse logic — flipped `FetchTextAsync` from
    `private` to `internal` in `GeoAuditHelpers.cs` so this new file could reuse it directly for the
    per-bot/blocked-agent breakdown (which needs the raw robots.txt text, not just the composite
    score `ScoreRobotsAiAccessAsync` returns).
  - `compare_geo_score_deltas` → added to the existing `GeoToolHandlers.cs` (not `DriftToolHandlers.cs`
    — see the domain-classification gotcha below). Orchestrates 5 concurrent `GeoAuditHelpers` live
    HTTP checks (llms.txt, robots, meta signals, freshness, AI discovery) per domain × 2 domains via
    nested `Task.WhenAll`, mirroring Python's nested `ThreadPoolExecutor`s.
- Regex translation note: all ~25 Python regex patterns across the detector/citability files ported
  1:1 to .NET `[GeneratedRegex]` (compile-time source-generated regex, matches the `re.compile`
  pattern used throughout Python) — syntax was directly compatible (`\b`, character classes,
  `(?:...)`, named flags via `RegexOptions.IgnoreCase|Multiline|Singleline`). One pattern
  (`invisible_unicode`) uses literal zero-width Unicode characters in the character class — verified
  byte-for-byte via a Python hex dump before trusting it, and left a comment since the codepoints
  aren't visible in an editor.
- Deferred 14 tools, all confirmed via the domain diff (not by name/directory guessing): the
  `geo/agent_readiness.py` cluster (11 tools — needs NEW live-fetch helpers for agents.md/skill.md/
  agent-permissions/markdown-sibling-probing, a distinct sub-feature from what `GeoAuditHelpers`
  already covers) plus `list_pages_missing_article_schema` (`content/content_lists.py`) and
  `check_ai_citation_presence` (`integrations/integration_tools.py`) — both cross-file oddities
  worth re-checking with the diff before starting the next `geo` batch, not assumed still-missing.
- Tests: `GeoDetectorsToolHandlerTests.cs` (8), `GeoCitabilityToolHandlerTests.cs` (5),
  `GeoListToolHandlerTests.cs` (8, using a small inline `FakeHandler : HttpMessageHandler` — this
  test project had no precedent for mocking `HttpClient`-consuming handlers before this session, see
  that file for the pattern), `GeoToolHandlersCompareTests.cs` (2). Full suite: 235 passed (up from
  212), verified stable across 3 repeated runs.

## Next

1. Highest-value next domains by remaining-tool count: `crawl` (27 remaining), `google` (19
   remaining, needs a new GA4 page/device/channel/path-trend loader per earlier notes), `portfolio`
   (14 remaining).
2. Never assume a domain's remaining count without re-running the diff — several "not started"
   domains above may already have partial C# coverage classified under a different Python domain
   name (as happened with `schema`/`onpage`/`content` overlap).
3. When porting any new tool that needs artifact output, reuse `ArtifactStore` — don't re-invent
   file storage. When a tool needs report CSV/JSON/PDF export specifically, check whether the Data
   service already has it (`ReportExportController`) before porting Python's version — it may
   already be the canonical implementation, as was true for `export_audit_report`.
4. `expand_keywords` (last `keywords` tool) needs `integrations/google/suggest.py::batch_expand`
   ported — external Google Suggest HTTP calls (web/youtube/questions) with concurrency + its own
   Postgres cache table (`keyword_suggest_cache`). Scope this as its own unit, not a quick add-on.
5. `get_integration_alerts` (last `drift` tool) needs `tools/alert_checker.py::check_all_alerts`
   ported — health-score-drop check (reads `audit_health_snapshots`, already mapped in C#) +
   GSC-links-stale check (needs a new all-properties `LEFT JOIN`/`GROUP BY` query). Also touches
   SMTP/webhook dispatch code that likely doesn't need porting (chat wouldn't trigger alert sends).
6. The `geo/agent_readiness.py` cluster (11 tools, last big chunk of `geo`) needs new live-fetch
   helpers (agents.md, skill.md, agent-permissions, markdown-sibling probing) — a distinct follow-up
   from what's already in `GeoAuditHelpers.cs`. Scope as its own unit like `expand_keywords`.
7. Any new test touching `DATA_DIR` (artifact-related) must use `[Collection("DATA_DIR env var")]`.
   Any new test needing a mocked `HttpClient` can copy the `FakeHandler : HttpMessageHandler` pattern
   from `GeoListToolHandlerTests.cs`.
8. When a Python tool sounds like it belongs to a domain by name (e.g. `compare_geo_score_deltas`),
   verify its ACTUAL classification via `tools_catalog_by_domain()` before assuming which batch it
   belongs in — naming and domain classification can diverge (this happened three times now: the
   `tech` domain mix-up, `compare_geo_score_deltas` → `geo`, and `list_pages_missing_article_schema`/
   `check_ai_citation_presence` living in unrelated files despite being classified under `geo`).
