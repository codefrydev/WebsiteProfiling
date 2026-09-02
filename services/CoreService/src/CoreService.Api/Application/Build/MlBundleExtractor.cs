using System.Text.Json;

namespace CoreService.Api.Application.Build;

internal static class MlBundleExtractor
{
    public static Dictionary<string, object?> FromBridgePayload(JsonElement payload)
    {
        var bundle = new Dictionary<string, object?>();
        if (payload.ValueKind != JsonValueKind.Object)
        {
            return bundle;
        }

        CopyIfPresent(payload, bundle, "content_duplicates");
        CopyIfPresent(payload, bundle, "language_summary");
        CopyIfPresent(payload, bundle, "ml_errors");
        CopyIfPresent(payload, bundle, "ner_site_summary");
        CopyIfPresent(payload, bundle, "llm_meta");
        CopyIfPresent(payload, bundle, "url_duplicate_group_id");
        CopyIfPresent(payload, bundle, "similar_internal_by_url");
        CopyIfPresent(payload, bundle, "language_by_url");
        CopyIfPresent(payload, bundle, "spacy_by_url");
        CopyIfPresent(payload, bundle, "keyphrases_by_url");
        return bundle;
    }

    private static void CopyIfPresent(JsonElement payload, Dictionary<string, object?> bundle, string key)
    {
        if (payload.TryGetProperty(key, out var el))
        {
            bundle[key] = el.Clone();
        }
    }
}
