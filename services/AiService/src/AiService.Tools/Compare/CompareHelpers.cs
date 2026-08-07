using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Compare;

/// <summary>
/// Report payload comparison — ports Python <c>reporting/compare_payload.py</c> (parity with web
/// <c>reportCompare.ts</c>/<c>reportCompareExtras.ts</c>).
/// </summary>
public static class CompareHelpers
{
    private static readonly Dictionary<string, int> PriorityOrder = new(StringComparer.Ordinal)
    {
        ["Critical"] = 0,
        ["High"] = 1,
        ["Medium"] = 2,
        ["Low"] = 3,
    };

    private const int LhDeltaThreshold = 5;
    private const int IssueDeltaCap = 100;
    private const int LinkMetricCap = 200;

    private static readonly (string Key, string Label, bool HigherIsBetter)[] SeoHealthFields =
    [
        ("missing_title", "Missing title", false),
        ("title_ok", "Title OK", true),
        ("missing_meta_desc", "Missing meta description", false),
        ("meta_desc_ok", "Meta description OK", true),
        ("h1_zero", "Pages with no H1", false),
        ("h1_one", "Pages with one H1", true),
        ("h1_multi", "Pages with multiple H1s", false),
        ("thin_content", "Thin content (flagged)", false),
    ];

    public static int RoundHalfUp(double value) => (int)Math.Floor(value + 0.5);

    public static string NormReportUrl(string? url)
    {
        var raw = (url ?? "").Trim();
        if (raw.Length == 0)
        {
            return "";
        }

        try
        {
            var uri = new Uri(raw, UriKind.RelativeOrAbsolute);
            if (!uri.IsAbsoluteUri)
            {
                return raw.ToLowerInvariant();
            }

            var host = uri.Host.ToLowerInvariant();
            if (host.Length == 0)
            {
                return raw.ToLowerInvariant();
            }

            var path = string.IsNullOrEmpty(uri.AbsolutePath) ? "/" : uri.AbsolutePath;
            return $"{host}{path}";
        }
        catch (Exception ex) when (ex is UriFormatException or InvalidOperationException)
        {
            return raw.ToLowerInvariant();
        }
    }

    public static int? ScoreFromCategories(JsonArray? categories)
    {
        var scores = (categories ?? [])
            .OfType<JsonObject>()
            .Select(c => JsonCoercion.AsDouble(c["score"]))
            .Where(s => s is not null)
            .Select(s => s!.Value)
            .ToList();
        return scores.Count == 0 ? null : RoundHalfUp(scores.Sum() / scores.Count);
    }

    private static string IssueKey(string url, string category, string message)
        => $"{NormReportUrl(url)}|{category}|{Truncate(message, 120)}";

    private static string Truncate(string value, int max) => value.Length <= max ? value : value[..max];

    private static Dictionary<string, JsonObject> FlattenCategoryIssues(JsonObject payload)
    {
        var result = new Dictionary<string, JsonObject>();
        foreach (var cat in (payload["categories"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var category = JsonCoercion.AsString(cat["name"]) ?? JsonCoercion.AsString(cat["id"]) ?? "";
            foreach (var issue in (cat["issues"] as JsonArray ?? []).OfType<JsonObject>())
            {
                var url = JsonCoercion.AsString(issue["url"]) ?? "";
                var message = (JsonCoercion.AsString(issue["message"]) ?? JsonCoercion.AsString(issue["recommendation"]) ?? "").Trim();
                if (url.Length == 0 && message.Length == 0)
                {
                    continue;
                }

                var key = IssueKey(url, category, message);
                result[key] = new JsonObject
                {
                    ["kind"] = "new",
                    ["url"] = url.Length > 0 ? url : "—",
                    ["category"] = category,
                    ["priority"] = JsonCoercion.AsString(issue["priority"]) ?? "Medium",
                    ["message"] = message.Length > 0 ? message : "—",
                };
            }
        }

        return result;
    }

    public static List<JsonObject> BuildIssueDeltas(JsonObject current, JsonObject baseline)
    {
        var cur = FlattenCategoryIssues(current);
        var baseMap = FlattenCategoryIssues(baseline);
        var outRows = new List<JsonObject>();
        foreach (var (key, row) in cur)
        {
            if (!baseMap.ContainsKey(key))
            {
                var clone = (JsonObject)row.DeepClone();
                clone["kind"] = "new";
                outRows.Add(clone);
            }
        }

        foreach (var (key, row) in baseMap)
        {
            if (!cur.ContainsKey(key))
            {
                var clone = (JsonObject)row.DeepClone();
                clone["kind"] = "resolved";
                outRows.Add(clone);
            }
        }

        return outRows
            .OrderBy(x => PriorityOrder.GetValueOrDefault(JsonCoercion.AsString(x["priority"]) ?? "Low", 9))
            .ThenBy(x => JsonCoercion.AsString(x["kind"]) == "new" ? 0 : 1)
            .ThenBy(x => JsonCoercion.AsString(x["url"]) ?? "", StringComparer.Ordinal)
            .ToList();
    }

    public static List<JsonObject> BuildPriorityCounts(JsonObject current, JsonObject baseline)
    {
        Dictionary<string, int> CountMap(JsonObject payload)
        {
            var counts = new Dictionary<string, int>(StringComparer.Ordinal) { ["Critical"] = 0, ["High"] = 0, ["Medium"] = 0, ["Low"] = 0 };
            foreach (var cat in (payload["categories"] as JsonArray ?? []).OfType<JsonObject>())
            {
                foreach (var issue in (cat["issues"] as JsonArray ?? []).OfType<JsonObject>())
                {
                    var p = JsonCoercion.AsString(issue["priority"]) ?? "Medium";
                    counts[p] = counts.GetValueOrDefault(p) + 1;
                }
            }

            return counts;
        }

        var cur = CountMap(current);
        var basePrio = CountMap(baseline);
        string[] priorities = ["Critical", "High", "Medium", "Low"];
        return priorities
            .Select(p => new JsonObject
            {
                ["priority"] = p,
                ["current"] = cur.GetValueOrDefault(p),
                ["baseline"] = basePrio.GetValueOrDefault(p),
                ["delta"] = cur.GetValueOrDefault(p) - basePrio.GetValueOrDefault(p),
            })
            .ToList();
    }

    private static double? ScaleLhScore(double? score01, double? fallback0100)
    {
        if (score01 is not null)
        {
            return Math.Round(score01.Value * 100);
        }

        return fallback0100 is not null ? Math.Round(fallback0100.Value) : null;
    }

    private static Dictionary<string, (double? Perf, double? Seo)> LhFromPayload(JsonObject payload)
    {
        var result = new Dictionary<string, (double?, double?)>();
        if (payload["lighthouse_by_url"] is JsonObject byUrl)
        {
            foreach (var (rawUrl, node) in byUrl)
            {
                if (node is not JsonObject summary)
                {
                    continue;
                }

                var k = NormReportUrl(rawUrl);
                if (k.Length == 0)
                {
                    continue;
                }

                var metrics = summary["median_metrics"] as JsonObject ?? summary;
                result[k] = (
                    ScaleLhScore(JsonCoercion.AsDouble(metrics["performance_score"]), JsonCoercion.AsDouble(summary["performance"])),
                    ScaleLhScore(JsonCoercion.AsDouble(metrics["seo_score"]), JsonCoercion.AsDouble(summary["seo"])));
            }
        }

        foreach (var link in (payload["links"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var k = NormReportUrl(JsonCoercion.AsString(link["url"]) ?? "");
            if (k.Length == 0 || result.ContainsKey(k))
            {
                continue;
            }

            var lh = link["lighthouse"] as JsonObject;
            var metrics = lh?["median_metrics"] as JsonObject;
            result[k] = (
                ScaleLhScore(JsonCoercion.AsDouble(metrics?["performance_score"]), null),
                ScaleLhScore(JsonCoercion.AsDouble(metrics?["seo_score"]), null));
        }

        return result;
    }

    public static List<JsonObject> BuildLighthouseUrlDeltas(JsonObject current, JsonObject baseline)
    {
        var cur = LhFromPayload(current);
        var baseLh = LhFromPayload(baseline);
        var outRows = new List<JsonObject>();
        foreach (var (k, c) in cur)
        {
            if (!baseLh.TryGetValue(k, out var b))
            {
                continue;
            }

            double? perfDelta = c.Perf is not null && b.Perf is not null ? c.Perf - b.Perf : null;
            double? seoDelta = c.Seo is not null && b.Seo is not null ? c.Seo - b.Seo : null;
            if ((perfDelta is not null && Math.Abs(perfDelta.Value) >= LhDeltaThreshold)
                || (seoDelta is not null && Math.Abs(seoDelta.Value) >= LhDeltaThreshold))
            {
                outRows.Add(new JsonObject
                {
                    ["url"] = k,
                    ["performance_current"] = c.Perf,
                    ["performance_baseline"] = b.Perf,
                    ["performance_delta"] = perfDelta,
                    ["seo_current"] = c.Seo,
                    ["seo_baseline"] = b.Seo,
                    ["seo_delta"] = seoDelta,
                });
            }
        }

        return outRows.OrderByDescending(x => Math.Abs(JsonCoercion.Num(x["performance_delta"]))).ToList();
    }

    public static List<JsonObject> BuildLinkMetricDeltas(JsonObject current, JsonObject baseline)
    {
        (string Key, string Metric, double MinDelta)[] specs =
        [
            ("inlinks", "inlinks", 1),
            ("outlinks", "outlinks", 1),
            ("word_count", "word_count", 25),
            ("response_time_ms", "response_ms", 150),
        ];

        var curMap = new Dictionary<string, JsonObject>();
        foreach (var l in (current["links"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var k = NormReportUrl(JsonCoercion.AsString(l["url"]) ?? "");
            if (k.Length > 0)
            {
                curMap[k] = l;
            }
        }

        var outRows = new List<JsonObject>();
        foreach (var bl in (baseline["links"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var k = NormReportUrl(JsonCoercion.AsString(bl["url"]) ?? "");
            if (k.Length == 0 || !curMap.TryGetValue(k, out var cl))
            {
                continue;
            }

            foreach (var (key, metric, minDelta) in specs)
            {
                var c = JsonCoercion.AsDouble(cl[key]);
                var b = JsonCoercion.AsDouble(bl[key]);
                if (c is null || b is null)
                {
                    continue;
                }

                var delta = Math.Round((c.Value - b.Value) * 10) / 10;
                if (Math.Abs(delta) >= minDelta)
                {
                    outRows.Add(new JsonObject
                    {
                        ["url"] = JsonCoercion.AsString(cl["url"]) ?? JsonCoercion.AsString(bl["url"]),
                        ["metric"] = metric,
                        ["current"] = c,
                        ["baseline"] = b,
                        ["delta"] = delta,
                    });
                }
            }
        }

        return outRows.OrderByDescending(x => Math.Abs(JsonCoercion.Num(x["delta"]))).ToList();
    }

    private static string RedirectKey(JsonObject r) => NormReportUrl(JsonCoercion.AsString(r["url"]) ?? JsonCoercion.AsString(r["from"]) ?? "");

    public static List<JsonObject> BuildRedirectDeltas(JsonObject current, JsonObject baseline)
    {
        Dictionary<string, JsonObject> ToMap(JsonArray? list) => (list ?? [])
            .OfType<JsonObject>()
            .Select(r => (Key: RedirectKey(r), Row: r))
            .Where(x => x.Key.Length > 0)
            .GroupBy(x => x.Key)
            .ToDictionary(
                g => g.Key,
                g => new JsonObject
                {
                    ["kind"] = "new",
                    ["url"] = JsonCoercion.AsString(g.Last().Row["url"]) ?? JsonCoercion.AsString(g.Last().Row["from"]) ?? g.Key,
                    ["status"] = JsonCoercion.AsString(g.Last().Row["status"]) ?? "—",
                    ["final_url"] = JsonCoercion.AsString(g.Last().Row["final_url"]) ?? JsonCoercion.AsString(g.Last().Row["to"]) ?? "",
                });

        var cur = ToMap(current["redirects"] as JsonArray);
        var baseMap = ToMap(baseline["redirects"] as JsonArray);
        var outRows = new List<JsonObject>();
        foreach (var (k, row) in cur)
        {
            if (!baseMap.ContainsKey(k))
            {
                var clone = (JsonObject)row.DeepClone();
                clone["kind"] = "new";
                outRows.Add(clone);
            }
        }

        foreach (var (k, row) in baseMap)
        {
            if (!cur.ContainsKey(k))
            {
                var clone = (JsonObject)row.DeepClone();
                clone["kind"] = "removed";
                outRows.Add(clone);
            }
        }

        return outRows.OrderBy(x => JsonCoercion.AsString(x["url"]) ?? "", StringComparer.Ordinal).ToList();
    }

    private static string SecurityKey(JsonObject f)
        => $"{NormReportUrl(JsonCoercion.AsString(f["url"]) ?? "")}|{JsonCoercion.AsString(f["finding_type"])}|{Truncate(JsonCoercion.AsString(f["message"]) ?? "", 80)}";

    public static List<JsonObject> BuildSecurityDeltas(JsonObject current, JsonObject baseline)
    {
        Dictionary<string, JsonObject> ToMap(JsonArray? list) => (list ?? [])
            .OfType<JsonObject>()
            .ToDictionary(SecurityKey, f => new JsonObject
            {
                ["kind"] = "new",
                ["url"] = JsonCoercion.AsString(f["url"]) ?? "—",
                ["severity"] = JsonCoercion.AsString(f["severity"]) ?? "—",
                ["finding_type"] = JsonCoercion.AsString(f["finding_type"]) ?? "—",
                ["message"] = JsonCoercion.AsString(f["message"]) ?? "—",
            });

        var cur = ToMap(current["security_findings"] as JsonArray);
        var baseMap = ToMap(baseline["security_findings"] as JsonArray);
        var outRows = new List<JsonObject>();
        foreach (var (key, row) in cur)
        {
            if (!baseMap.ContainsKey(key))
            {
                var clone = (JsonObject)row.DeepClone();
                clone["kind"] = "new";
                outRows.Add(clone);
            }
        }

        foreach (var (key, row) in baseMap)
        {
            if (!cur.ContainsKey(key))
            {
                var clone = (JsonObject)row.DeepClone();
                clone["kind"] = "resolved";
                outRows.Add(clone);
            }
        }

        return outRows;
    }

    public static List<JsonObject> BuildDuplicateDeltas(JsonObject current, JsonObject baseline)
    {
        Dictionary<string, (string Rep, int Members)> ToMap(JsonArray? list)
        {
            var m = new Dictionary<string, (string, int)>();
            foreach (var c in (list ?? []).OfType<JsonObject>())
            {
                var k = (JsonCoercion.AsString(c["id"]) ?? JsonCoercion.AsString(c["representative_url"]) ?? "").Trim();
                if (k.Length == 0)
                {
                    continue;
                }

                var members = JsonCoercion.AsInt(c["member_count"]) ?? (c["member_urls"] as JsonArray)?.Count ?? 0;
                m[k] = (JsonCoercion.AsString(c["representative_url"]) ?? k, members);
            }

            return m;
        }

        var cur = ToMap(current["content_duplicates"] as JsonArray);
        var baseMap = ToMap(baseline["content_duplicates"] as JsonArray);
        var outRows = new List<JsonObject>();
        foreach (var (cid, c) in cur)
        {
            if (!baseMap.TryGetValue(cid, out var b))
            {
                outRows.Add(new JsonObject { ["kind"] = "new", ["cluster_id"] = cid, ["representative_url"] = c.Rep, ["current_members"] = c.Members, ["baseline_members"] = 0 });
            }
            else if (c.Members != b.Members)
            {
                outRows.Add(new JsonObject { ["kind"] = "changed", ["cluster_id"] = cid, ["representative_url"] = c.Rep, ["current_members"] = c.Members, ["baseline_members"] = b.Members });
            }
        }

        foreach (var (cid, b) in baseMap)
        {
            if (!cur.ContainsKey(cid))
            {
                outRows.Add(new JsonObject { ["kind"] = "removed", ["cluster_id"] = cid, ["representative_url"] = b.Rep, ["current_members"] = 0, ["baseline_members"] = b.Members });
            }
        }

        return outRows;
    }

    public static List<JsonObject> BuildTechDeltas(JsonObject current, JsonObject baseline)
    {
        Dictionary<string, int> ToMap(JsonObject payload)
        {
            var m = new Dictionary<string, int>(StringComparer.Ordinal);
            var tech = payload["tech_stack_summary"] as JsonObject;
            foreach (var t in (tech?["technologies"] as JsonArray ?? []).OfType<JsonObject>())
            {
                var name = (JsonCoercion.AsString(t["name"]) ?? JsonCoercion.AsString(t["tech"]) ?? "").Trim();
                if (name.Length > 0)
                {
                    m[name] = JsonCoercion.AsInt(t["count"]) ?? 0;
                }
            }

            return m;
        }

        var cur = ToMap(current);
        var baseMap = ToMap(baseline);
        var outRows = new List<JsonObject>();
        foreach (var (name, count) in cur)
        {
            if (!baseMap.ContainsKey(name))
            {
                outRows.Add(new JsonObject { ["kind"] = "added", ["name"] = name, ["current_count"] = count, ["baseline_count"] = 0 });
            }
        }

        foreach (var (name, count) in baseMap)
        {
            if (!cur.ContainsKey(name))
            {
                outRows.Add(new JsonObject { ["kind"] = "removed", ["name"] = name, ["current_count"] = 0, ["baseline_count"] = count });
            }
        }

        return outRows.OrderBy(x => JsonCoercion.AsString(x["name"]) ?? "", StringComparer.Ordinal).ToList();
    }

    private static JsonObject MetricRow(string id, string label, double? current, double? baseline, bool higherIsBetter, string fmt = "count")
    {
        double? delta = current is not null && baseline is not null ? Math.Round((current.Value - baseline.Value) * 10) / 10 : null;
        return new JsonObject
        {
            ["id"] = id,
            ["label"] = label,
            ["current"] = current,
            ["baseline"] = baseline,
            ["delta"] = delta,
            ["higher_is_better"] = higherIsBetter,
            ["format"] = fmt,
        };
    }

    public static List<JsonObject> BuildContentMetrics(JsonObject current, JsonObject baseline)
    {
        var cw = (current["content_analytics"] as JsonObject)?["word_count_stats"] as JsonObject;
        var bw = (baseline["content_analytics"] as JsonObject)?["word_count_stats"] as JsonObject;
        var curThinPages = (current["content_analytics"] as JsonObject)?["thin_pages"] as JsonArray;
        var curThin = curThinPages?.Count ?? JsonCoercion.AsInt((current["seo_health"] as JsonObject)?["thin_content"]) ?? 0;
        var baseThinPages = (baseline["content_analytics"] as JsonObject)?["thin_pages"] as JsonArray;
        var baseThin = baseThinPages?.Count ?? JsonCoercion.AsInt((baseline["seo_health"] as JsonObject)?["thin_content"]) ?? 0;
        var cs = current["social_coverage"] as JsonObject;
        var bs = baseline["social_coverage"] as JsonObject;
        var curSummary = current["summary"] as JsonObject;
        var baseSummary = baseline["summary"] as JsonObject;
        var curResp = current["response_time_stats"] as JsonObject;
        var baseResp = baseline["response_time_stats"] as JsonObject;

        var rows = new List<JsonObject>
        {
            MetricRow("mean_words", "Mean words", JsonCoercion.AsDouble(cw?["mean"]), JsonCoercion.AsDouble(bw?["mean"]), true),
            MetricRow("median_words", "Median words", JsonCoercion.AsDouble(cw?["median"]), JsonCoercion.AsDouble(bw?["median"]), true),
            MetricRow("thin_pages", "Thin pages", curThin, baseThin, false),
            MetricRow(
                "dup_groups",
                "Duplicate groups",
                (current["content_duplicates"] as JsonArray)?.Count ?? 0,
                (baseline["content_duplicates"] as JsonArray)?.Count ?? 0,
                false),
            MetricRow("og_cov", "OG coverage %", JsonCoercion.AsDouble(cs?["og_coverage_pct"]), JsonCoercion.AsDouble(bs?["og_coverage_pct"]), true, "percent"),
            MetricRow("tw_cov", "Twitter coverage %", JsonCoercion.AsDouble(cs?["twitter_coverage_pct"]), JsonCoercion.AsDouble(bs?["twitter_coverage_pct"]), true, "percent"),
            MetricRow("resp_p50", "Response p50 ms", JsonCoercion.AsDouble(curResp?["p50"]), JsonCoercion.AsDouble(baseResp?["p50"]), false),
            MetricRow("resp_p95", "Response p95 ms", JsonCoercion.AsDouble(curResp?["p95"]), JsonCoercion.AsDouble(baseResp?["p95"]), false),
            MetricRow("crawl_time", "Crawl duration s", JsonCoercion.AsDouble(curSummary?["crawl_time_s"]), JsonCoercion.AsDouble(baseSummary?["crawl_time_s"]), false),
            MetricRow("count_3xx", "Redirect pages", JsonCoercion.AsDouble(curSummary?["count_3xx"]), JsonCoercion.AsDouble(baseSummary?["count_3xx"]), false),
            MetricRow("avg_outlinks", "Avg outlinks", JsonCoercion.AsDouble(curSummary?["avg_outlinks"]), JsonCoercion.AsDouble(baseSummary?["avg_outlinks"]), true),
        };
        return rows.Where(r => r["current"] is not null || r["baseline"] is not null).ToList();
    }

    public static JsonObject BuildGoogleMetrics(JsonObject current, JsonObject baseline)
    {
        var cg = ((current["google"] as JsonObject)?["gsc"] as JsonObject)?["summary"] as JsonObject;
        var bg = ((baseline["google"] as JsonObject)?["gsc"] as JsonObject)?["summary"] as JsonObject;
        var ca = ((current["google"] as JsonObject)?["ga4"] as JsonObject)?["summary"] as JsonObject;
        var ba = ((baseline["google"] as JsonObject)?["ga4"] as JsonObject)?["summary"] as JsonObject;
        var hasGsc = cg is not null || bg is not null;
        var hasGa4 = ca is not null || ba is not null;
        if (!hasGsc && !hasGa4)
        {
            return new JsonObject { ["available"] = false, ["metrics"] = new JsonArray() };
        }

        var rows = new List<JsonObject>();
        if (hasGsc)
        {
            rows.Add(MetricRow("gsc_clicks", "GSC clicks", JsonCoercion.AsDouble(cg?["clicks"]), JsonCoercion.AsDouble(bg?["clicks"]), true));
            rows.Add(MetricRow("gsc_impr", "GSC impressions", JsonCoercion.AsDouble(cg?["impressions"]), JsonCoercion.AsDouble(bg?["impressions"]), true));
            rows.Add(MetricRow("gsc_ctr", "GSC CTR", JsonCoercion.AsDouble(cg?["ctr"]), JsonCoercion.AsDouble(bg?["ctr"]), true, "percent"));
            rows.Add(MetricRow("gsc_pos", "GSC position", JsonCoercion.AsDouble(cg?["position"]), JsonCoercion.AsDouble(bg?["position"]), false));
        }

        if (hasGa4)
        {
            rows.Add(MetricRow("ga4_sessions", "GA4 sessions", JsonCoercion.AsDouble(ca?["sessions"]), JsonCoercion.AsDouble(ba?["sessions"]), true));
            rows.Add(MetricRow("ga4_users", "GA4 users", JsonCoercion.AsDouble(ca?["activeUsers"]), JsonCoercion.AsDouble(ba?["activeUsers"]), true));
            rows.Add(MetricRow("ga4_views", "GA4 page views", JsonCoercion.AsDouble(ca?["screenPageViews"]), JsonCoercion.AsDouble(ba?["screenPageViews"]), true));
            rows.Add(MetricRow("ga4_engagement", "GA4 engagement", JsonCoercion.AsDouble(ca?["engagementRate"]), JsonCoercion.AsDouble(ba?["engagementRate"]), true, "percent"));
        }

        var metrics = rows.Where(r => r["current"] is not null || r["baseline"] is not null).ToList();
        return new JsonObject { ["available"] = true, ["metrics"] = new JsonArray(metrics.Select(m => (JsonNode?)m).ToArray()) };
    }

    public static List<JsonObject> BuildSeoHealthDeltas(JsonObject current, JsonObject baseline)
    {
        var cur = current["seo_health"] as JsonObject ?? [];
        var baseHealth = baseline["seo_health"] as JsonObject ?? [];
        var outRows = new List<JsonObject>();
        foreach (var (key, label, higher) in SeoHealthFields)
        {
            var c = JsonCoercion.AsInt(cur[key]) ?? 0;
            var b = JsonCoercion.AsInt(baseHealth[key]) ?? 0;
            if (c == b)
            {
                continue;
            }

            outRows.Add(new JsonObject { ["id"] = key, ["label"] = label, ["current"] = c, ["baseline"] = b, ["delta"] = c - b, ["higher_is_better"] = higher });
        }

        return outRows.OrderByDescending(x => Math.Abs(JsonCoercion.Num(x["delta"]))).ToList();
    }

    public static List<JsonObject> BuildCategoryScores(JsonObject current, JsonObject baseline)
    {
        var baseMap = (baseline["categories"] as JsonArray ?? [])
            .OfType<JsonObject>()
            .Select(c => (Key: (JsonCoercion.AsString(c["id"]) ?? JsonCoercion.AsString(c["name"]) ?? "").Trim(), Cat: c))
            .Where(x => x.Key.Length > 0)
            .ToDictionary(x => x.Key, x => x.Cat);

        var rows = new List<JsonObject>();
        foreach (var c in (current["categories"] as JsonArray ?? []).OfType<JsonObject>())
        {
            var k = (JsonCoercion.AsString(c["id"]) ?? JsonCoercion.AsString(c["name"]) ?? "").Trim();
            if (k.Length == 0)
            {
                continue;
            }

            baseMap.TryGetValue(k, out var b);
            var curScore = JsonCoercion.AsDouble(c["score"]);
            var baseScore = JsonCoercion.AsDouble(b?["score"]);
            double? delta = curScore is not null && baseScore is not null ? curScore - baseScore : null;
            rows.Add(new JsonObject
            {
                ["id"] = k,
                ["name"] = JsonCoercion.AsString(c["name"]) ?? JsonCoercion.AsString(c["id"]) ?? k,
                ["current"] = curScore is not null ? Math.Round(curScore.Value) : null,
                ["baseline"] = baseScore is not null ? Math.Round(baseScore.Value) : null,
                ["delta"] = delta is not null ? Math.Round(delta.Value) : null,
            });
        }

        return rows.OrderByDescending(x => Math.Abs(JsonCoercion.Num(x["delta"]))).ToList();
    }

    public static JsonObject BuildUrlSetDiff(JsonObject current, JsonObject baseline)
    {
        Dictionary<string, string> UrlMap(JsonObject payload)
        {
            var m = new Dictionary<string, string>();
            foreach (var link in (payload["links"] as JsonArray ?? []).OfType<JsonObject>())
            {
                var raw = (JsonCoercion.AsString(link["url"]) ?? "").Trim();
                var k = NormReportUrl(raw);
                if (k.Length > 0 && !m.ContainsKey(k))
                {
                    m[k] = raw;
                }
            }

            return m;
        }

        var curMap = UrlMap(current);
        var baseMap = UrlMap(baseline);
        var newNorm = curMap.Keys.Except(baseMap.Keys).OrderBy(k => k, StringComparer.Ordinal).ToList();
        var removedNorm = baseMap.Keys.Except(curMap.Keys).OrderBy(k => k, StringComparer.Ordinal).ToList();
        return new JsonObject
        {
            ["new_urls"] = new JsonArray(newNorm.Select(k => (JsonNode?)curMap[k]).ToArray()),
            ["removed_urls"] = new JsonArray(removedNorm.Select(k => (JsonNode?)baseMap[k]).ToArray()),
            ["new_count"] = newNorm.Count,
            ["removed_count"] = removedNorm.Count,
        };
    }

    public static JsonObject BuildIndexationDeltas(JsonObject current, JsonObject baseline)
    {
        var curCov = current["indexation_coverage"] as JsonObject ?? [];
        var baseCov = baseline["indexation_coverage"] as JsonObject ?? [];
        var curCounts = curCov["counts"] as JsonObject ?? [];
        var baseCounts = baseCov["counts"] as JsonObject ?? [];
        var countDeltas = new JsonArray();
        foreach (var key in curCounts.Select(kvp => kvp.Key).Union(baseCounts.Select(kvp => kvp.Key)).OrderBy(k => k, StringComparer.Ordinal))
        {
            var curV = JsonCoercion.AsInt(curCounts[key]) ?? 0;
            var baseV = JsonCoercion.AsInt(baseCounts[key]) ?? 0;
            countDeltas.Add(new JsonObject { ["metric"] = key, ["current"] = curCounts[key]?.DeepClone(), ["baseline"] = baseCounts[key]?.DeepClone(), ["delta"] = curV - baseV });
        }

        string[] gapTypes = ["sitemap_only", "crawled_not_in_sitemap", "gsc_not_crawled"];
        var curLists = curCov["lists"] as JsonObject ?? [];
        var baseLists = baseCov["lists"] as JsonObject ?? [];
        var gapDeltas = new JsonObject();

        static HashSet<string> NormSet(JsonArray? items) => (items ?? [])
            .Select(JsonCoercion.AsString)
            .Where(u => !string.IsNullOrEmpty(u))
            .Select(u => NormReportUrl(u))
            .ToHashSet();

        foreach (var gap in gapTypes)
        {
            var curSet = NormSet(curLists[gap] as JsonArray);
            var baseSet = NormSet(baseLists[gap] as JsonArray);
            var added = curSet.Except(baseSet).OrderBy(u => u, StringComparer.Ordinal).ToList();
            var removed = baseSet.Except(curSet).OrderBy(u => u, StringComparer.Ordinal).ToList();
            gapDeltas[gap] = new JsonObject
            {
                ["added_count"] = added.Count,
                ["removed_count"] = removed.Count,
                ["added"] = new JsonArray(added.Take(50).Select(u => (JsonNode?)u).ToArray()),
                ["removed"] = new JsonArray(removed.Take(50).Select(u => (JsonNode?)u).ToArray()),
            };
        }

        return new JsonObject { ["count_deltas"] = countDeltas, ["gap_deltas"] = gapDeltas };
    }

    public static JsonObject BuildOrphanDeltas(JsonObject current, JsonObject baseline)
    {
        static HashSet<string> OrphanSet(JsonObject payload) => (payload["orphan_urls"] as JsonArray ?? [])
            .Select(JsonCoercion.AsString)
            .Where(u => !string.IsNullOrEmpty(u))
            .Select(u => NormReportUrl(u))
            .ToHashSet();

        var curSet = OrphanSet(current);
        var baseSet = OrphanSet(baseline);
        var added = curSet.Except(baseSet).OrderBy(u => u, StringComparer.Ordinal).ToList();
        var removed = baseSet.Except(curSet).OrderBy(u => u, StringComparer.Ordinal).ToList();
        return new JsonObject
        {
            ["current_count"] = curSet.Count,
            ["baseline_count"] = baseSet.Count,
            ["delta"] = curSet.Count - baseSet.Count,
            ["added"] = new JsonArray(added.Take(100).Select(u => (JsonNode?)u).ToArray()),
            ["removed"] = new JsonArray(removed.Take(100).Select(u => (JsonNode?)u).ToArray()),
            ["added_count"] = added.Count,
            ["removed_count"] = removed.Count,
        };
    }

    public static JsonObject BuildFullCompare(JsonObject current, JsonObject baseline, long? currentReportId, long? baselineReportId)
    {
        var curHealth = ScoreFromCategories(current["categories"] as JsonArray);
        var baseHealth = ScoreFromCategories(baseline["categories"] as JsonArray);
        var issueDeltas = BuildIssueDeltas(current, baseline);
        var truncatedSections = new JsonObject();
        if (issueDeltas.Count > IssueDeltaCap)
        {
            truncatedSections["issue_deltas"] = true;
            issueDeltas = issueDeltas.Take(IssueDeltaCap).ToList();
        }

        var linkMetrics = BuildLinkMetricDeltas(current, baseline);
        if (linkMetrics.Count > LinkMetricCap)
        {
            truncatedSections["link_metric_deltas"] = true;
            linkMetrics = linkMetrics.Take(LinkMetricCap).ToList();
        }

        var google = BuildGoogleMetrics(current, baseline);
        return new JsonObject
        {
            ["current_report_id"] = currentReportId,
            ["baseline_report_id"] = baselineReportId,
            ["current_generated_at"] = current["report_generated_at"]?.DeepClone(),
            ["baseline_generated_at"] = baseline["report_generated_at"]?.DeepClone(),
            ["health_score"] = new JsonObject
            {
                ["current"] = curHealth,
                ["baseline"] = baseHealth,
                ["delta"] = curHealth is not null && baseHealth is not null ? curHealth - baseHealth : null,
            },
            ["category_scores"] = new JsonArray(BuildCategoryScores(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["priority_counts"] = new JsonArray(BuildPriorityCounts(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["issue_deltas"] = new JsonArray(issueDeltas.Select(r => (JsonNode?)r).ToArray()),
            ["lighthouse_url_deltas"] = new JsonArray(BuildLighthouseUrlDeltas(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["link_metric_deltas"] = new JsonArray(linkMetrics.Select(r => (JsonNode?)r).ToArray()),
            ["redirect_deltas"] = new JsonArray(BuildRedirectDeltas(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["security_deltas"] = new JsonArray(BuildSecurityDeltas(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["duplicate_deltas"] = new JsonArray(BuildDuplicateDeltas(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["tech_deltas"] = new JsonArray(BuildTechDeltas(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["content_metrics"] = new JsonArray(BuildContentMetrics(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["google_metrics"] = google["metrics"]?.DeepClone() ?? new JsonArray(),
            ["google_available"] = google["available"]?.DeepClone() ?? false,
            ["seo_health_metrics"] = new JsonArray(BuildSeoHealthDeltas(current, baseline).Select(r => (JsonNode?)r).ToArray()),
            ["truncated_sections"] = truncatedSections,
        };
    }
}
