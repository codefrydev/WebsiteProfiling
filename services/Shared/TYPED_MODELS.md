# Typed models conventions (.NET services)

Shared contracts live in `services/Shared/WebsiteProfiling.Shared/Contracts/`.

## Rules

1. **Public tool handler signature stays `Task<JsonObject>`** (MCP + 369-tool catalog compatibility).
2. **Inside handlers:** parse args with `ToolArgsMapper` → typed logic → serialize with `ToolResultMapper`.
3. **Domain shapes** (`IssueRecord`, `CrawlRow`, `GoogleSlice`, …) belong in Contracts; service-specific API DTOs stay in each service's `Dto/` folder.
4. **JSON only at boundaries:** DB JSONB, LLM text, MCP wire, Python bridge (until removed).
5. **Do not model full `report_payload`** — use slice records (`ReportMetaSlice`, `IssuesBucketSlice`, `GoogleSlice`).

## Per-service mappers

| Service | Mapper location |
|---------|-----------------|
| AiService | `src/AiService.Api/Tools/Mapping/` |
| CoreService | `src/CoreService.Api/DataApplication/Mapping/` (`PayloadSliceMapper`, `AuditReportMapper`, `ChapterMappers`), `src/CoreService.Api/IntegrationsApplication/Google/PageLookupMapper.cs` |

## Coercion

Use `WebsiteProfiling.Contracts.Json.JsonCoercion` for safe scalar reads from `JsonNode` / `JsonElement`.

Serialize/deserialize with `ContractJsonOptions.Options` (snake_case JSON matching DB/API payloads).
