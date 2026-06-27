using System.Globalization;
using System.Text.Json.Nodes;
using AiService.Tools.Models.Insight;
using AiService.Tools.Slice;
using WebsiteProfiling.Contracts.Google;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Tools.Handlers.Insight;

/// <summary>
/// Pure cross-platform insight math — faithful port of Python
/// <c>website_profiling.tools.audit_tools.insight.insight_helpers</c>. Kept side-effect free so it
/// can be unit-tested against the Python behavior.
/// </summary>
public static class InsightLogic
{
    /// <summary>Coerce a JSON scalar to a double, mirroring Python <c>float(val)</c> with a default.</summary>
    public static double Num(JsonNode? node, double @default = 0.0) => JsonCoercion.Num(node, @default);

    /// <summary>Pick (gsc_full|gsc, ga4_full|ga4) blobs from a raw google snapshot.</summary>
    public static (JsonObject Gsc, JsonObject Ga4) GscGa4Blobs(JsonObject raw)
    {
        var gsc = raw["gsc_full"] as JsonObject ?? raw["gsc"] as JsonObject ?? new JsonObject();
        var ga4 = raw["ga4_full"] as JsonObject ?? raw["ga4"] as JsonObject ?? new JsonObject();
        return (gsc, ga4);
    }

    public static ProvenanceBlock ProvenanceBlock(IReadOnlyList<string> sources, JsonNode? fetchedAt, string confidence = "high")
        => ProvenanceBlockTyped(sources, JsonCoercion.AsString(fetchedAt), confidence);

    public static ProvenanceBlock ProvenanceBlockTyped(
        IReadOnlyList<string> sources,
        string? fetchedAt,
        string confidence = "high")
        => new()
        {
            Sources = sources,
            FetchedAt = fetchedAt,
            Confidence = confidence,
        };

    public static JsonObject ProvenanceBlockJson(IReadOnlyList<string> sources, JsonNode? fetchedAt, string confidence = "high")
    {
        var block = ProvenanceBlock(sources, fetchedAt, confidence);
        var arr = new JsonArray();
        foreach (var s in block.Sources)
        {
            arr.Add(s);
        }

        return new JsonObject
        {
            ["sources"] = arr,
            ["fetched_at"] = block.FetchedAt is { Length: > 0 } fa ? fa : null,
            ["confidence"] = block.Confidence,
        };
    }

    public static string ClassifyOpportunityQuadrant(GscPageRecord? gscRow, Ga4PageRecord? ga4Row, double siteMedianSessions)
    {
        var position = gscRow?.Position ?? 99;
        var impressions = gscRow?.Impressions ?? 0;
        var sessions = ga4Row?.Sessions ?? 0;
        var engagement = ga4Row?.EngagementRate ?? 0;

        var rankPotential = impressions >= 100 && position >= 4 && position <= 20;
        var convertPotential = sessions >= Math.Max(siteMedianSessions * 0.5, 5) || engagement >= 0.5;

        if (rankPotential && convertPotential)
        {
            return "high_impact";
        }

        if (rankPotential)
        {
            return "worth_optimizing";
        }

        return convertPotential ? "good_but_capped" : "low_priority";
    }

    public static string ClassifyOpportunityQuadrant(JsonObject? gscRow, JsonObject? ga4Row, double siteMedianSessions)
    {
        var position = Num(gscRow?["position"], 99);
        var impressions = Num(gscRow?["impressions"]);
        var sessions = Num(ga4Row?["sessions"]);
        var engagement = Num(ga4Row?["engagementRate"]);
        return ClassifyOpportunityQuadrant(
            gscRow is null ? null : new GscPageRecord { Position = position, Impressions = (int)impressions },
            ga4Row is null ? null : new Ga4PageRecord { Sessions = (int)sessions, EngagementRate = engagement },
            siteMedianSessions);
    }

    public static TrafficHealthResult TrafficHealth(GscSummary? gscSummary, Ga4Summary? ga4Summary)
    {
        var clicks = gscSummary?.Clicks ?? 0;
        var sessions = ga4Summary?.Sessions ?? 0;
        if (clicks <= 0 && sessions <= 0)
        {
            return new TrafficHealthResult
            {
                GscClicks = clicks,
                Ga4Sessions = sessions,
                Ratio = null,
                Diagnosis = "no_data",
                Note = "Connect GSC and GA4 and re-run the pipeline.",
            };
        }

        double? ratio = clicks > 0 ? (double)sessions / clicks : null;
        var diagnosis = "healthy";
        var note = "GSC clicks and GA4 sessions are in a plausible range.";
        if (ratio is double r)
        {
            if (r < 0.3)
            {
                diagnosis = "tracking_gap";
                note = "GA4 sessions are much lower than GSC clicks — check filters, consent mode, or landing page tagging.";
            }
            else if (r > 3.0)
            {
                diagnosis = "filter_issue";
                note = "GA4 sessions exceed GSC clicks — GA4 may include non-organic traffic or GSC date range differs.";
            }
        }

        return new TrafficHealthResult
        {
            GscClicks = clicks,
            Ga4Sessions = sessions,
            Ratio = ratio is double rr ? Math.Round(rr, 3) : null,
            Diagnosis = diagnosis,
            Note = note,
        };
    }

    public static JsonObject TrafficHealthRatio(JsonObject? gscSummary, JsonObject? ga4Summary)
    {
        GscSummary? gsc = null;
        Ga4Summary? ga4 = null;
        if (gscSummary is not null)
        {
            gsc = new GscSummary
            {
                Clicks = (int)Num(gscSummary["clicks"]),
                Impressions = (int)Num(gscSummary["impressions"]),
                Ctr = Num(gscSummary["ctr"]),
                Position = Num(gscSummary["position"]),
            };
        }

        if (ga4Summary is not null)
        {
            ga4 = new Ga4Summary
            {
                Sessions = (int)Num(ga4Summary["sessions"]),
                ActiveUsers = (int)Num(ga4Summary["activeUsers"]),
                ScreenPageViews = (int)Num(ga4Summary["screenPageViews"]),
            };
        }

        var health = TrafficHealth(gsc, ga4);
        return new JsonObject
        {
            ["gsc_clicks"] = health.GscClicks,
            ["ga4_sessions"] = health.Ga4Sessions,
            ["ratio"] = health.Ratio,
            ["diagnosis"] = health.Diagnosis,
            ["note"] = health.Note,
        };
    }

    public static IReadOnlyList<LandingPageBlendedRow> BlendLandingPagesTyped(
        GoogleSlice google,
        int limit,
        int minImpressions)
    {
        var gscByPage = google.Gsc?.ByPage ?? new Dictionary<string, GscPageRecord>(StringComparer.Ordinal);
        var ga4ByPath = google.Ga4?.ByPath ?? new Dictionary<string, Ga4PageRecord>(StringComparer.Ordinal);

        var ga4ByNorm = new Dictionary<string, Ga4PageRecord>(StringComparer.Ordinal);
        foreach (var (path, val) in ga4ByPath)
        {
            var full = !string.IsNullOrEmpty(val.FullUrl) ? val.FullUrl : path;
            ga4ByNorm[GoogleUrl.NormalizeUrl(full)] = val;
            ga4ByNorm[GoogleUrl.NormalizeUrl(path)] = val;
        }

        var sessionVals = ga4ByNorm.Values.Select(v => (double)v.Sessions).OrderBy(x => x).ToList();
        var median = sessionVals.Count > 0 ? sessionVals[sessionVals.Count / 2] : 0.0;

        var built = new List<(LandingPageBlendedRow Row, long Clicks, long Impressions)>();
        foreach (var (pageUrl, gscRow) in gscByPage)
        {
            if (gscRow.Impressions < minImpressions)
            {
                continue;
            }

            var norm = GoogleUrl.NormalizeUrl(pageUrl);
            if (!ga4ByNorm.TryGetValue(norm, out var ga4Row))
            {
                var path = GoogleUrl.UrlToPath(pageUrl);
                ga4ByNorm.TryGetValue(GoogleUrl.NormalizeUrl(path), out ga4Row);
            }

            var quadrant = ClassifyOpportunityQuadrant(gscRow, ga4Row, median);
            var row = new LandingPageBlendedRow
            {
                Url = pageUrl,
                GscClicks = gscRow.Clicks,
                GscImpressions = gscRow.Impressions,
                GscPosition = Math.Round(gscRow.Position, 1),
                GscCtr = Math.Round(gscRow.Ctr, 4),
                Ga4Sessions = ga4Row?.Sessions ?? 0,
                Ga4EngagementRate = ga4Row is not null ? Math.Round(ga4Row.EngagementRate, 3) : null,
                Quadrant = quadrant,
            };
            built.Add((row, row.GscClicks, row.GscImpressions));
        }

        var take = Math.Max(1, Math.Min(limit, 100));
        return built
            .OrderByDescending(x => x.Clicks)
            .ThenByDescending(x => x.Impressions)
            .Take(take)
            .Select(x => x.Row)
            .ToList();
    }

    /// <summary>
    /// Blend GSC by_page with GA4 by_path into opportunity rows. Faithful port of
    /// <c>blend_landing_pages</c> (median over deduped GA4 values; impression filter; clicks-desc sort).
    /// </summary>
    public static JsonArray BlendLandingPages(JsonObject gscByPage, JsonObject ga4ByPath, int limit, int minImpressions)
    {
        var gscDict = new Dictionary<string, GscPageRecord>(StringComparer.Ordinal);
        foreach (var (key, valNode) in gscByPage)
        {
            if (valNode is JsonObject val)
            {
                gscDict[key] = new GscPageRecord
                {
                    Page = JsonCoercion.AsString(val["page"]) ?? key,
                    Clicks = (int)Num(val["clicks"]),
                    Impressions = (int)Num(val["impressions"]),
                    Ctr = Num(val["ctr"]),
                    Position = Num(val["position"]),
                };
            }
        }

        var ga4Dict = new Dictionary<string, Ga4PageRecord>(StringComparer.Ordinal);
        foreach (var (key, valNode) in ga4ByPath)
        {
            if (valNode is JsonObject val)
            {
                ga4Dict[key] = new Ga4PageRecord
                {
                    Path = key,
                    FullUrl = JsonCoercion.AsString(val["full_url"]) ?? "",
                    Sessions = (int)Num(val["sessions"]),
                    EngagementRate = Num(val["engagementRate"]),
                };
            }
        }

        var slice = new GoogleSlice
        {
            Gsc = new GoogleSlice.GscBlob { ByPage = gscDict },
            Ga4 = new GoogleSlice.Ga4Blob { ByPath = ga4Dict },
        };

        var rows = BlendLandingPagesTyped(slice, limit, minImpressions);
        var result = new JsonArray();
        foreach (var row in rows)
        {
            result.Add(new JsonObject
            {
                ["url"] = row.Url,
                ["gsc_clicks"] = row.GscClicks,
                ["gsc_impressions"] = row.GscImpressions,
                ["gsc_position"] = row.GscPosition,
                ["gsc_ctr"] = row.GscCtr,
                ["ga4_sessions"] = row.Ga4Sessions,
                ["ga4_engagement_rate"] = row.Ga4EngagementRate,
                ["quadrant"] = row.Quadrant,
            });
        }

        return result;
    }

    public static JsonObject SliceFromGoogleRow(JsonObject raw, string pageUrl)
    {
        var (gscBlob, ga4Blob) = GscGa4Blobs(raw);
        var byPage = gscBlob["by_page"] as JsonObject ?? [];
        var byPath = ga4Blob["by_path"] as JsonObject ?? [];
        var norm = GoogleUrl.NormalizeUrl(pageUrl);

        JsonObject? gscPage = null;
        foreach (var (key, val) in byPage)
        {
            if (GoogleUrl.NormalizeUrl(key) == norm || key == pageUrl)
            {
                gscPage = val as JsonObject;
                break;
            }
        }

        if (gscPage is null && gscBlob["top_pages"] is JsonArray topPages)
        {
            foreach (var node in topPages)
            {
                if (node is JsonObject row
                    && GoogleUrl.NormalizeUrl(JsonCoercion.AsString(row["page"]) ?? "") == norm)
                {
                    gscPage = row;
                    break;
                }
            }
        }

        JsonObject? ga4Page = null;
        var path = GoogleUrl.UrlToPath(pageUrl);
        if (byPath.TryGetPropertyValue(path, out var ga4Node) && ga4Node is JsonObject ga4Direct)
        {
            ga4Page = ga4Direct;
        }
        else
        {
            foreach (var (p, val) in byPath)
            {
                if (val is JsonObject row
                    && (GoogleUrl.NormalizeUrl(JsonCoercion.AsString(row["full_url"]) ?? p) == norm
                        || p == path))
                {
                    ga4Page = row;
                    break;
                }
            }
        }

        return new JsonObject
        {
            ["gsc"] = gscPage?.DeepClone(),
            ["ga4"] = ga4Page?.DeepClone(),
            ["siteBenchmarks"] = new JsonObject
            {
                ["gsc"] = gscBlob["summary"]?.DeepClone(),
                ["ga4"] = ga4Blob["summary"]?.DeepClone(),
            },
        };
    }

    public static JsonArray PageIssueFlags(string url, JsonObject payload)
    {
        var norm = GoogleUrl.NormalizeUrl(url);
        var flags = new JsonArray();
        if (payload["categories"] is not JsonArray categories)
        {
            return flags;
        }

        foreach (var catNode in categories)
        {
            if (catNode is not JsonObject cat || cat["issues"] is not JsonArray issueList)
            {
                continue;
            }

            foreach (var issueNode in issueList)
            {
                if (issueNode is not JsonObject issue)
                {
                    continue;
                }

                var issueUrl = JsonCoercion.AsString(issue["url"]) ?? "";
                if (issueUrl.Length > 0 && GoogleUrl.NormalizeUrl(issueUrl) != norm)
                {
                    continue;
                }

                flags.Add(new JsonObject
                {
                    ["priority"] = issue["priority"]?.DeepClone(),
                    ["category_id"] = cat["id"]?.DeepClone(),
                    ["message"] = issue["message"]?.DeepClone(),
                    ["url"] = issueUrl.Length > 0 ? issueUrl : url,
                });

                if (flags.Count >= 30)
                {
                    return flags;
                }
            }
        }

        return flags;
    }

    public static JsonObject? LookupLighthouse(string url, JsonObject payload)
    {
        if (payload["lighthouse_by_url"] is not JsonObject map)
        {
            return null;
        }

        if (map[url] is JsonObject direct)
        {
            return direct;
        }

        var norm = url.Trim();
        foreach (var (key, val) in map)
        {
            if (key.Trim() == norm && val is JsonObject lh)
            {
                return lh;
            }
        }

        return null;
    }

    public static JsonObject CompositePageScore(
        JsonObject sliceData,
        JsonArray issueFlags,
        JsonObject? lighthouse)
    {
        var gscPage = sliceData["gsc"] as JsonObject;
        var ga4Page = sliceData["ga4"] as JsonObject;
        var benchmarks = sliceData["siteBenchmarks"] as JsonObject ?? [];
        var gscSite = benchmarks["gsc"] as JsonObject;
        var ga4Site = benchmarks["ga4"] as JsonObject;

        var score = 75.0;
        var flagsOut = new JsonArray();
        var sitePos = Num(gscSite?["position"], 10);
        var pagePos = Num(gscPage?["position"], sitePos);
        if (pagePos > sitePos + 5)
        {
            score -= 10;
            flagsOut.Add("below_avg_gsc_position");
        }

        var siteEng = Num(ga4Site?["engagementRate"], 0.5);
        var pageEng = Num(ga4Page?["engagementRate"], siteEng);
        if (ga4Page is not null && pageEng < siteEng * 0.7)
        {
            score -= 10;
            flagsOut.Add("low_engagement");
        }

        var crit = issueFlags.Count(n => n?["priority"]?.GetValue<string>() == "Critical");
        var high = issueFlags.Count(n => n?["priority"]?.GetValue<string>() == "High");
        if (crit > 0)
        {
            score -= Math.Min(20, crit * 10);
            flagsOut.Add("critical_issues");
        }
        else if (high > 0)
        {
            score -= Math.Min(10, high * 5);
            flagsOut.Add("high_issues");
        }

        if (lighthouse is not null)
        {
            var perf = Num(lighthouse["performance"], 100);
            var seo = Num(lighthouse["seo"], 100);
            if (perf < 50)
            {
                score -= 8;
                flagsOut.Add("poor_lighthouse_performance");
            }

            if (seo < 70)
            {
                score -= 5;
                flagsOut.Add("poor_lighthouse_seo");
            }
        }

        score = Math.Clamp(Math.Round(score), 0, 100);
        var band = score >= 75 ? "green" : score >= 50 ? "amber" : "red";
        return new JsonObject
        {
            ["score"] = score,
            ["band"] = band,
            ["flags"] = flagsOut,
        };
    }
}
