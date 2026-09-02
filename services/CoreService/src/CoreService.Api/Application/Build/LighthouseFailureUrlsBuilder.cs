using System.Text.Json.Nodes;

namespace CoreService.Api.Application.Build;

/// <summary>Port of Python reporting/builder.py lighthouse_failure_urls bucketing.</summary>
public static class LighthouseFailureUrlsBuilder
{
    private static readonly Dictionary<string, string> AuditMap = new(StringComparer.Ordinal)
    {
        ["lcp"] = "largest-contentful-paint",
        ["inp"] = "interaction-to-next-paint",
        ["cls"] = "cumulative-layout-shift",
    };

    public static Dictionary<string, object?> Build(IReadOnlyDictionary<string, JsonNode> lighthouseByUrl)
    {
        var buckets = new Dictionary<string, List<Dictionary<string, object?>>>(StringComparer.Ordinal)
        {
            ["lcp"] = [],
            ["inp"] = [],
            ["cls"] = [],
            ["seo"] = [],
        };

        foreach (var (url, node) in lighthouseByUrl)
        {
            if (node is not JsonObject obj)
            {
                continue;
            }

            var auditById = BuildAuditIndex(obj);
            foreach (var (bucket, auditId) in AuditMap)
            {
                if (!auditById.TryGetValue(auditId, out var audit)
                    || !TryGetScore(audit, out var score)
                    || score >= 0.9)
                {
                    continue;
                }

                buckets[bucket].Add(new Dictionary<string, object?>
                {
                    ["url"] = url,
                    ["score"] = score,
                    ["displayValue"] = audit.TryGetPropertyValue("displayValue", out var dv) ? JsonValueToObject(dv) : null,
                });
            }

            if (obj.TryGetPropertyValue("category_scores", out var catNode)
                && catNode is JsonObject catObj
                && catObj.TryGetPropertyValue("seo", out var seoNode)
                && TryGetJsonDouble(seoNode, out var seoScore))
            {
                var norm = seoScore > 1 ? seoScore / 100.0 : seoScore;
                if (norm < 0.9)
                {
                    buckets["seo"].Add(new Dictionary<string, object?>
                    {
                        ["url"] = url,
                        ["score"] = seoScore,
                        ["displayValue"] = null,
                    });
                }
            }
        }

        return buckets.ToDictionary(kv => kv.Key, kv => (object?)kv.Value, StringComparer.Ordinal);
    }

    private static Dictionary<string, JsonObject> BuildAuditIndex(JsonObject lh)
    {
        var map = new Dictionary<string, JsonObject>(StringComparer.Ordinal);
        if (!lh.TryGetPropertyValue("audits", out var auditsNode) || auditsNode is not JsonArray audits)
        {
            return map;
        }

        foreach (var item in audits)
        {
            if (item is not JsonObject audit)
            {
                continue;
            }

            if (audit.TryGetPropertyValue("id", out var idNode)
                && idNode is JsonValue idVal
                && idVal.TryGetValue(out string? id)
                && !string.IsNullOrEmpty(id))
            {
                map[id] = audit;
            }
        }

        return map;
    }

    private static bool TryGetScore(JsonObject audit, out double score)
    {
        score = 0;
        return audit.TryGetPropertyValue("score", out var scoreNode) && TryGetJsonDouble(scoreNode, out score);
    }

    private static bool TryGetJsonDouble(JsonNode? node, out double value)
    {
        value = 0;
        if (node is not JsonValue jv)
        {
            return false;
        }

        if (jv.TryGetValue(out double d))
        {
            value = d;
            return true;
        }

        if (jv.TryGetValue(out int i))
        {
            value = i;
            return true;
        }

        return false;
    }

    private static object? JsonValueToObject(JsonNode? node) =>
        node switch
        {
            null => null,
            JsonValue v when v.TryGetValue(out string? s) => s,
            JsonValue v when v.TryGetValue(out double d) => d,
            JsonValue v when v.TryGetValue(out int i) => i,
            JsonValue v when v.TryGetValue(out bool b) => b,
            _ => node.ToJsonString(),
        };
}
