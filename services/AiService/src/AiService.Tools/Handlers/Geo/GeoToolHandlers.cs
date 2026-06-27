using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Tools.Context;
using AiService.Tools.Persistence;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Geo;

/// <summary>GEO/AEO audit read tools — ports Python <c>geo/geo_tools.py</c>.</summary>
public static class GeoToolHandlers
{
    private static readonly string[] QaUrlHints = ["/faq", "/faqs", "/help", "/support", "/questions"];

    public static async Task<JsonObject> GetLlmsTxtStatusAsync(
        HttpClient http,
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var domain = await scoped.ResolvePropertyDomainAsync(db, cancellationToken);
        var result = await GeoAuditHelpers.FetchLlmsTxtAsync(http, domain, cancellationToken);
        result["domain"] = domain;
        result["provenance"] = "Crawl";
        if (result["found"] is JsonValue { } found && found.GetValueKind() == System.Text.Json.JsonValueKind.True)
        {
            result["llms_full_txt_found"] = await GeoAuditHelpers.FetchLlmsFullTxtAsync(
                http, GeoAuditHelpers.BaseUrl(domain), cancellationToken);
        }

        return result;
    }

    public static async Task<JsonObject> GetAiDiscoveryStatusAsync(
        HttpClient http,
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var domain = await scoped.ResolvePropertyDomainAsync(db, cancellationToken);
        var result = await GeoAuditHelpers.FetchAiDiscoveryAsync(http, domain, cancellationToken);
        result["domain"] = domain;
        result["provenance"] = "Crawl";
        return result;
    }

    public static async Task<JsonObject> GetFaqSchemaCoverageAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        return ComputeFaqSchemaCoverage(rows);
    }

    public static async Task<JsonObject> ListPagesMissingFaqSchemaAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject
            {
                ["pages"] = new JsonArray(),
                ["total"] = 0,
                ["truncated"] = false,
            };
        }

        var pages = new List<JsonObject>();
        foreach (var row in rows)
        {
            if (!CrawlSliceHelpers.IsSuccess2xx(row))
            {
                continue;
            }

            var url = (JsonCoercion.AsString(row["url"]) ?? "").ToLowerInvariant();
            var heading = (JsonCoercion.AsString(row["heading_text"]) ?? JsonCoercion.AsString(row["h1"]) ?? "").ToLowerInvariant();
            var looksQa = QaUrlHints.Any(h => url.Contains(h, StringComparison.Ordinal))
                || heading.Contains("faq", StringComparison.Ordinal)
                || heading.Contains('?');
            if (!looksQa || GeoAuditHelpers.HasFaqSchema(row))
            {
                continue;
            }

            pages.Add(new JsonObject
            {
                ["url"] = JsonCoercion.AsString(row["url"]) ?? "",
                ["title"] = JsonCoercion.AsString(row["title"]) ?? "",
                ["reason"] = "qa_heuristic_no_faq_schema",
            });
        }

        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(pages.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject
        {
            ["pages"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["provenance"] = "Estimated",
        };
    }

    public static async Task<JsonObject> GetGeoReadinessScoreAsync(
        HttpClient http,
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var payload = await scoped.LoadPayloadAsync(db, cancellationToken);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        var domain = await scoped.ResolvePropertyDomainAsync(db, cancellationToken);

        var total2xx = 0;
        var schemaPages = 0;
        var richSchemaPages = 0;
        var goodWordCount = 0;
        var goodHeadings = 0;
        var hasListsPages = 0;
        var orgSchemaPages = 0;
        foreach (var row in rows)
        {
            if (!CrawlSliceHelpers.IsSuccess2xx(row))
            {
                continue;
            }

            total2xx++;
            var schemaTypes = CrawlSliceHelpers.RowSchemaTypesList(row);
            var hasAnySchema = schemaTypes.Count > 0
                || (JsonCoercion.AsString(row["has_schema"]) ?? "").ToLowerInvariant() is "true" or "1" or "yes";
            if (hasAnySchema)
            {
                schemaPages++;
            }

            if (schemaTypes.Count >= 2)
            {
                richSchemaPages++;
            }

            if (schemaTypes.Any(t => t.Equals("organization", StringComparison.OrdinalIgnoreCase)
                || t.Equals("localbusiness", StringComparison.OrdinalIgnoreCase)
                || t.Equals("corporation", StringComparison.OrdinalIgnoreCase)))
            {
                orgSchemaPages++;
            }

            var wc = (int)JsonCoercion.Num(row["word_count"]);
            if (wc >= 300)
            {
                goodWordCount++;
            }

            var seq = (JsonCoercion.AsString(row["heading_sequence"]) ?? "").ToLowerInvariant();
            if (seq.Contains("h1") && seq.Contains("h2"))
            {
                goodHeadings++;
            }

            var excerpt = JsonCoercion.AsString(row["content_excerpt"]) ?? "";
            var html = JsonCoercion.AsString(row["html"]) ?? "";
            if (Regex.IsMatch(excerpt, @"^\s*[-*•]\s", RegexOptions.Multiline)
                || html.Contains("<li>", StringComparison.OrdinalIgnoreCase))
            {
                hasListsPages++;
            }
        }

        double schemaPct;
        double richPct;
        if (total2xx > 0)
        {
            schemaPct = schemaPages / (double)total2xx;
            richPct = richSchemaPages / (double)total2xx;
        }
        else
        {
            schemaPct = richPct = 0;
        }

        var schemaRaw = Math.Min(16, (int)Math.Round(schemaPct * 10 + richPct * 6));
        var contentRaw = total2xx > 0
            ? Math.Min(12, (int)Math.Round(
                goodWordCount / (double)total2xx * 6
                + goodHeadings / (double)total2xx * 4
                + hasListsPages / (double)total2xx * 2))
            : 0;

        var ner = payload["ner_site_summary"] as JsonObject;
        var entities = ner?["entities"] as JsonArray ?? ner?["top_entities"] as JsonArray;
        var entityCount = entities?.Count ?? 0;
        var faqCov = ComputeFaqSchemaCoverage(rows);
        var faqPct = JsonCoercion.Num(faqCov["coverage_pct"]) / 100.0;
        var brandRaw = total2xx > 0
            ? Math.Min(10, (int)Math.Round(
                Math.Min(entityCount * 0.5, 5.0)
                + orgSchemaPages / (double)total2xx * 3
                + faqPct * 2))
            : 0;

        var llmsTask = GeoAuditHelpers.FetchLlmsTxtAsync(http, domain, cancellationToken);
        var robotsTask = GeoAuditHelpers.ScoreRobotsAiAccessAsync(http, domain, cancellationToken);
        var metaTask = GeoAuditHelpers.ScoreMetaSignalsAsync(http, domain, cancellationToken);
        var freshnessTask = GeoAuditHelpers.ScoreFreshnessSignalsAsync(http, domain, cancellationToken);
        var discoveryTask = GeoAuditHelpers.FetchAiDiscoveryAsync(http, domain, cancellationToken);
        await Task.WhenAll(llmsTask, robotsTask, metaTask, freshnessTask, discoveryTask);

        JsonObject GetOrEmpty(Task<JsonObject> task)
        {
            try
            {
                return task.IsCompletedSuccessfully ? task.Result : [];
            }
            catch
            {
                return [];
            }
        }

        var llms = GetOrEmpty(llmsTask);
        var llmsDepth = llms["found"] is JsonValue { } lf && lf.GetValueKind() == System.Text.Json.JsonValueKind.True
            ? llms["depth"] as JsonObject ?? []
            : [];
        var llmsRaw = JsonCoercion.Num(llmsDepth["depth_score"]);
        var robotsRaw = JsonCoercion.Num(GetOrEmpty(robotsTask)["robots_score"]);
        var metaRaw = JsonCoercion.Num(GetOrEmpty(metaTask)["meta_score"]);
        var freshnessRaw = JsonCoercion.Num(GetOrEmpty(freshnessTask)["freshness_score"]);
        var discoveryRaw = JsonCoercion.Num(GetOrEmpty(discoveryTask)["discovery_score"]);

        var totalScore = Math.Min(100, Math.Round(
            robotsRaw + llmsRaw + schemaRaw + metaRaw + contentRaw + brandRaw + freshnessRaw + discoveryRaw, 1));

        var categories = new JsonObject
        {
            ["robots_ai_access"] = new JsonObject { ["score"] = robotsRaw, ["max"] = 18 },
            ["llms_txt"] = new JsonObject { ["score"] = llmsRaw, ["max"] = 18 },
            ["schema_json_ld"] = new JsonObject { ["score"] = schemaRaw, ["max"] = 16 },
            ["meta_tags"] = new JsonObject { ["score"] = metaRaw, ["max"] = 14 },
            ["content"] = new JsonObject { ["score"] = contentRaw, ["max"] = 12 },
            ["brand_entity"] = new JsonObject { ["score"] = brandRaw, ["max"] = 10 },
            ["signals"] = new JsonObject { ["score"] = freshnessRaw, ["max"] = 6 },
            ["ai_discovery"] = new JsonObject { ["score"] = discoveryRaw, ["max"] = 6 },
        };

        var components = new JsonObject
        {
            ["schema_coverage"] = total2xx > 0 ? Math.Round(schemaPct * 100, 1) : 0,
            ["substantive_content"] = total2xx > 0 ? Math.Round(goodWordCount / (double)total2xx * 100, 1) : 0,
            ["heading_structure"] = total2xx > 0 ? Math.Round(goodHeadings / (double)total2xx * 100, 1) : 0,
            ["faq_schema_coverage"] = JsonCoercion.Num(faqCov["coverage_pct"]),
            ["entity_richness"] = Math.Min(100.0, entityCount * 5.0),
            ["llms_txt_present"] = llms["found"] is JsonValue fv && fv.GetValueKind() == System.Text.Json.JsonValueKind.True ? 100.0 : 0.0,
            ["meta_tags"] = metaRaw / 14 * 100,
            ["freshness_signals"] = freshnessRaw / 6 * 100,
            ["ai_discovery"] = discoveryRaw / 6 * 100,
            ["robots_ai_access"] = robotsRaw / 18 * 100,
        };

        return new JsonObject
        {
            ["geo_readiness_score"] = totalScore,
            ["band"] = GeoAuditHelpers.ScoreBand(totalScore),
            ["categories"] = categories,
            ["components"] = components,
            ["llms_txt"] = new JsonObject
            {
                ["found"] = llms["found"]?.DeepClone() ?? false,
                ["depth"] = llmsDepth.DeepClone(),
            },
            ["provenance"] = "Estimated",
        };
    }

    public static async Task<JsonObject> GetAeoContentSignalsForUrlAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var url = (JsonCoercion.AsString(args["url"]) ?? "").Trim();
        if (url.Length == 0)
        {
            return new JsonObject { ["error"] = "url is required" };
        }

        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["error"] = "no crawl data", ["url"] = url };
        }

        var needle = url.TrimEnd('/').ToLowerInvariant();
        foreach (var row in rows)
        {
            var rowUrl = (JsonCoercion.AsString(row["url"]) ?? "").TrimEnd('/').ToLowerInvariant();
            if (rowUrl != needle)
            {
                continue;
            }

            var excerpt = JsonCoercion.AsString(row["content_excerpt"]) ?? "";
            var words = excerpt.Split(' ', StringSplitOptions.RemoveEmptyEntries);
            var lead = string.Join(' ', words.Take(80));
            var html = JsonCoercion.AsString(row["html"]) ?? "";
            var hasList = Regex.IsMatch(excerpt, @"^\s*[-*•]\s", RegexOptions.Multiline)
                || html.Contains("<li>", StringComparison.OrdinalIgnoreCase);
            var hasDefinition = Regex.IsMatch(lead.Length > 400 ? lead[..400] : lead, @"\b(is|are|means|refers to)\b", RegexOptions.IgnoreCase);
            var wc = (int)JsonCoercion.Num(row["word_count"]);
            var entityMentions = 0;
            if (row["top_keywords"] is JsonArray kwArr)
            {
                entityMentions = kwArr.Count;
            }
            else if (JsonCoercion.AsString(row["top_keywords"]) is { Length: > 0 })
            {
                entityMentions = 1;
            }

            var quotability = 0;
            if (wc >= 200)
            {
                quotability += 25;
            }

            if (hasList)
            {
                quotability += 20;
            }

            if (hasDefinition)
            {
                quotability += 25;
            }

            if (GeoAuditHelpers.HasFaqSchema(row))
            {
                quotability += 30;
            }

            return new JsonObject
            {
                ["url"] = JsonCoercion.AsString(row["url"]) ?? "",
                ["word_count"] = wc,
                ["lead_excerpt"] = lead.Length > 300 ? lead[..300] : lead,
                ["has_lists"] = hasList,
                ["has_definition_pattern"] = hasDefinition,
                ["entity_keyword_count"] = entityMentions,
                ["quotability_score"] = Math.Min(100, quotability),
                ["provenance"] = "Estimated",
            };
        }

        return new JsonObject { ["error"] = "url not found in crawl", ["url"] = url };
    }

    public static async Task<JsonObject> GetEeatSignalsSummaryAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["missing"] = true };
        }

        var authorPages = 0;
        var orgSchema = 0;
        var aboutContact = 0;
        foreach (var row in rows)
        {
            if (!CrawlSliceHelpers.IsSuccess2xx(row))
            {
                continue;
            }

            var types = CrawlSliceHelpers.RowSchemaTypesList(row).Select(t => t.ToLowerInvariant()).ToList();
            if (types.Any(t => t is "person" or "author"))
            {
                authorPages++;
            }

            if (types.Any(t => t is "organization" or "localbusiness" or "corporation"))
            {
                orgSchema++;
            }

            if (Uri.TryCreate(JsonCoercion.AsString(row["url"]), UriKind.Absolute, out var uri))
            {
                var path = uri.AbsolutePath.ToLowerInvariant();
                if (path.Contains("/about") || path.Contains("/contact") || path.Contains("/team") || path.Contains("/author"))
                {
                    aboutContact++;
                }
            }
        }

        return new JsonObject
        {
            ["pages_with_author_schema"] = authorPages,
            ["pages_with_organization_schema"] = orgSchema,
            ["about_contact_pages"] = aboutContact,
            ["provenance"] = "Crawl",
        };
    }

    public static async Task<JsonObject> GetJsRenderingDeltaAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0 || rows.All(r => r["fetch_method"] is null))
        {
            return new JsonObject
            {
                ["deltas"] = new JsonArray(),
                ["total"] = 0,
                ["note"] = "fetch_method not in crawl — use javascript or auto render mode",
            };
        }

        var byUrl = new Dictionary<string, Dictionary<string, JsonObject>>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in rows)
        {
            var url = (JsonCoercion.AsString(row["url"]) ?? "").TrimEnd('/').ToLowerInvariant();
            if (url.Length == 0)
            {
                continue;
            }

            var method = (JsonCoercion.AsString(row["fetch_method"]) ?? "static").ToLowerInvariant();
            var wc = (int)JsonCoercion.Num(row["word_count"]);
            if (!byUrl.TryGetValue(url, out var methods))
            {
                methods = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
                byUrl[url] = methods;
            }

            methods[method] = new JsonObject
            {
                ["title"] = JsonCoercion.AsString(row["title"]) ?? "",
                ["word_count"] = wc,
                ["h1"] = JsonCoercion.AsString(row["h1"]) ?? "",
            };
        }

        var deltas = new List<JsonObject>();
        foreach (var (url, methods) in byUrl)
        {
            if (!methods.TryGetValue("static", out var staticRow))
            {
                continue;
            }

            if (!methods.TryGetValue("rendered", out var rendered) && !methods.TryGetValue("javascript", out rendered))
            {
                continue;
            }

            var titleDiff = JsonCoercion.AsString(staticRow["title"]) != JsonCoercion.AsString(rendered["title"]);
            var wcDiff = Math.Abs((int)JsonCoercion.Num(staticRow["word_count"]) - (int)JsonCoercion.Num(rendered["word_count"]));
            var h1Diff = JsonCoercion.AsString(staticRow["h1"]) != JsonCoercion.AsString(rendered["h1"]);
            if (titleDiff || wcDiff > 50 || h1Diff)
            {
                deltas.Add(new JsonObject
                {
                    ["url"] = url,
                    ["static"] = staticRow.DeepClone(),
                    ["rendered"] = rendered.DeepClone(),
                    ["title_differs"] = titleDiff,
                    ["word_count_delta"] = wcDiff,
                    ["h1_differs"] = h1Diff,
                });
            }
        }

        deltas.Sort((a, b) => (int)JsonCoercion.Num(b["word_count_delta"]).CompareTo((int)JsonCoercion.Num(a["word_count_delta"])));
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 30, 50);
        var sliced = PayloadSliceHelpers.CapList(deltas.Cast<JsonNode?>().ToList(), limit, 50);
        return new JsonObject
        {
            ["deltas"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["provenance"] = "Crawl",
        };
    }

    public static async Task<JsonObject> GetInternalLinkSuggestionsAsync(
        AuditToolsDbContext db,
        AuditToolContext ctx,
        JsonObject args,
        CancellationToken cancellationToken)
    {
        var sourceUrl = (JsonCoercion.AsString(args["url"]) ?? "").Trim();
        if (sourceUrl.Length == 0)
        {
            return new JsonObject { ["error"] = "url is required" };
        }

        var scoped = ctx.WithArgs(args);
        var rows = await scoped.LoadCrawlDfAsync(db, cancellationToken);
        if (rows.Count == 0)
        {
            return new JsonObject { ["error"] = "no crawl data", ["suggestions"] = new JsonArray() };
        }

        var docs = new List<(string Url, List<string> Tokens, string Title)>();
        foreach (var row in rows)
        {
            if (!CrawlSliceHelpers.IsSuccess2xx(row))
            {
                continue;
            }

            var url = JsonCoercion.AsString(row["url"]) ?? "";
            var text = string.Join(' ',
                JsonCoercion.AsString(row["title"]) ?? "",
                JsonCoercion.AsString(row["h1"]) ?? "",
                JsonCoercion.AsString(row["content_excerpt"]) ?? "");
            var tokens = Tokenize(text);
            if (tokens.Count == 0)
            {
                continue;
            }

            docs.Add((url, tokens, JsonCoercion.AsString(row["title"]) ?? ""));
        }

        if (docs.Count < 2)
        {
            return new JsonObject { ["url"] = sourceUrl, ["suggestions"] = new JsonArray(), ["note"] = "insufficient crawl pages" };
        }

        var sourceDoc = docs.FirstOrDefault(d =>
            d.Url.TrimEnd('/').Equals(sourceUrl.TrimEnd('/'), StringComparison.OrdinalIgnoreCase));
        if (string.IsNullOrEmpty(sourceDoc.Url))
        {
            return new JsonObject { ["error"] = "source url not in crawl", ["url"] = sourceUrl };
        }

        var docFreq = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var doc in docs)
        {
            foreach (var token in doc.Tokens.Distinct(StringComparer.OrdinalIgnoreCase))
            {
                docFreq[token] = docFreq.GetValueOrDefault(token) + 1;
            }
        }

        var idf = docFreq.ToDictionary(
            kvp => kvp.Key,
            kvp => Math.Log((1 + docs.Count) / (1.0 + kvp.Value)) + 1,
            StringComparer.OrdinalIgnoreCase);

        var sourceTf = sourceDoc.Tokens.GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
            .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);
        var sourceVec = sourceTf.ToDictionary(
            kvp => kvp.Key,
            kvp => kvp.Value / (double)sourceDoc.Tokens.Count * idf.GetValueOrDefault(kvp.Key, 1),
            StringComparer.OrdinalIgnoreCase);
        var sourceNorm = Math.Sqrt(sourceVec.Values.Sum(v => v * v));
        if (sourceNorm == 0)
        {
            sourceNorm = 1;
        }

        var scored = new List<JsonObject>();
        foreach (var doc in docs)
        {
            if (doc.Url.TrimEnd('/').Equals(sourceUrl.TrimEnd('/'), StringComparison.OrdinalIgnoreCase))
            {
                continue;
            }

            var targetTf = doc.Tokens.GroupBy(t => t, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(g => g.Key, g => g.Count(), StringComparer.OrdinalIgnoreCase);
            var targetVec = targetTf.ToDictionary(
                kvp => kvp.Key,
                kvp => kvp.Value / (double)doc.Tokens.Count * idf.GetValueOrDefault(kvp.Key, 1),
                StringComparer.OrdinalIgnoreCase);
            var allTerms = sourceVec.Keys.Union(targetVec.Keys, StringComparer.OrdinalIgnoreCase);
            var dot = allTerms.Sum(t => sourceVec.GetValueOrDefault(t) * targetVec.GetValueOrDefault(t));
            var targetNorm = Math.Sqrt(targetVec.Values.Sum(v => v * v));
            if (targetNorm == 0)
            {
                targetNorm = 1;
            }

            var sim = dot / (sourceNorm * targetNorm);
            if (sim <= 0.05)
            {
                continue;
            }

            var shared = sourceDoc.Tokens.Intersect(doc.Tokens, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(t => idf.GetValueOrDefault(t, 0))
                .Take(3)
                .ToList();
            var anchorHint = doc.Title.Length > 0 ? doc.Title : shared.FirstOrDefault() ?? "related page";
            if (anchorHint.Length > 80)
            {
                anchorHint = anchorHint[..80];
            }

            scored.Add(new JsonObject
            {
                ["target_url"] = doc.Url,
                ["similarity"] = Math.Round(sim, 4),
                ["suggested_anchor"] = anchorHint,
                ["shared_terms"] = new JsonArray(shared.Select(t => JsonValue.Create(t)).ToArray()),
            });
        }

        scored.Sort((a, b) => JsonCoercion.Num(b["similarity"]).CompareTo(JsonCoercion.Num(a["similarity"])));
        var limit = PayloadSliceHelpers.ParseLimit(args["limit"], 5, 10);
        var sliced = PayloadSliceHelpers.CapList(scored.Cast<JsonNode?>().ToList(), limit, 10);
        return new JsonObject
        {
            ["url"] = sourceUrl,
            ["suggestions"] = sliced["items"]?.DeepClone(),
            ["total"] = sliced["total"]?.DeepClone(),
            ["truncated"] = sliced["truncated"]?.DeepClone(),
            ["provenance"] = "Estimated",
        };
    }

    private static JsonObject ComputeFaqSchemaCoverage(IReadOnlyList<JsonObject> rows)
    {
        if (rows.Count == 0)
        {
            return new JsonObject
            {
                ["pages_with_faq_schema"] = 0,
                ["total_2xx"] = 0,
                ["coverage_pct"] = 0,
            };
        }

        var total = 0;
        var withFaq = 0;
        foreach (var row in rows)
        {
            if (!CrawlSliceHelpers.IsSuccess2xx(row))
            {
                continue;
            }

            total++;
            if (GeoAuditHelpers.HasFaqSchema(row))
            {
                withFaq++;
            }
        }

        return new JsonObject
        {
            ["pages_with_faq_schema"] = withFaq,
            ["total_2xx"] = total,
            ["coverage_pct"] = total > 0 ? Math.Round(withFaq / (double)total * 100, 1) : 0,
            ["provenance"] = "Crawl",
        };
    }

    private static List<string> Tokenize(string text)
        => Regex.Matches(text, @"[a-z0-9]{3,}", RegexOptions.IgnoreCase)
            .Select(m => m.Value.ToLowerInvariant())
            .ToList();
}
