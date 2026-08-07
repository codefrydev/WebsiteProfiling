using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Application.Json;
using AiService.Domain;
using Microsoft.Extensions.Logging;

namespace AiService.Application.Services;

/// <summary>Port of <c>ollama_catalog.py</c> — local + cloud Ollama model catalog.</summary>
public sealed class OllamaCatalogService(IHttpClientFactory httpClientFactory, ILogger<OllamaCatalogService> logger)
{
    public const string OllamaCloudCatalogUrl = "https://ollama.com/api/tags";
    public const string LocalProbeClientName = "OllamaLocalProbe";
    public const string CloudCatalogClientName = "OllamaCloudCatalog";

    private static readonly Regex[] ProCloudModelPatterns =
    [
        new("671b", RegexOptions.IgnoreCase),
        new("480b", RegexOptions.IgnoreCase),
        new(":1t(?:-cloud|:cloud)?$", RegexOptions.IgnoreCase),
        new("v4-pro", RegexOptions.IgnoreCase),
        new("nemotron-3-ultra", RegexOptions.IgnoreCase),
        new("nemotron-3-super", RegexOptions.IgnoreCase),
        new("mistral-large", RegexOptions.IgnoreCase),
        new("397b", RegexOptions.IgnoreCase),
        new("cogito-2\\.1:671b", RegexOptions.IgnoreCase),
        new("deepseek-v4-pro", RegexOptions.IgnoreCase),
        new("qwen3-coder:480b", RegexOptions.IgnoreCase),
        new("gpt-oss:120b", RegexOptions.IgnoreCase),
    ];

    public async Task<JsonObject> FetchModelsAsync(string? baseUrl, CancellationToken cancellationToken = default)
    {
        var normalizedBase = (baseUrl ?? OllamaDefaults.BaseUrl).Trim().TrimEnd('/');
        if (string.IsNullOrEmpty(normalizedBase))
        {
            normalizedBase = OllamaDefaults.BaseUrl;
        }

        var localHttp = httpClientFactory.CreateClient(LocalProbeClientName);
        var cloudHttp = httpClientFactory.CreateClient(CloudCatalogClientName);

        var localTask = FetchJsonAsync(
            localHttp,
            $"{normalizedBase}/api/tags",
            TimeSpan.FromSeconds(8),
            probeKind: "local",
            cancellationToken);
        var cloudTask = FetchJsonAsync(
            cloudHttp,
            OllamaCloudCatalogUrl,
            TimeSpan.FromSeconds(12),
            probeKind: "cloud",
            cancellationToken);

        await Task.WhenAll(localTask, cloudTask);

        var localData = await localTask;
        var cloudData = await cloudTask;

        var localOk = localData is not null;
        var cloudCatalogOk = cloudData is not null;
        var health = OllamaConnectionHealth.Resolve(localOk, cloudCatalogOk);
        var catalogUsable = OllamaConnectionHealth.CatalogUsable(localOk, cloudCatalogOk);
        var warning = OllamaConnectionHealth.Warning(localOk, cloudCatalogOk, normalizedBase);

        var localModels = (localData?["models"] as JsonArray ?? [])
            .Select(NormalizeLocalModel)
            .Where(x => x is not null)
            .Cast<JsonObject>()
            .ToList();

        var cloudModels = (cloudData?["models"] as JsonArray ?? [])
            .Select(NormalizeCatalogModel)
            .Where(x => x is not null)
            .Cast<JsonObject>()
            .ToList();

        var models = MergeOllamaModels(localModels, cloudModels);

        if (!catalogUsable)
        {
            return new JsonObject
            {
                ["ok"] = false,
                ["health"] = health,
                ["baseUrl"] = normalizedBase,
                ["models"] = new JsonArray(),
                ["cloudCatalogOk"] = false,
                ["localOk"] = false,
                ["warning"] = null,
                ["error"] = OllamaConnectionHealth.OfflineError(localOk, cloudCatalogOk),
            };
        }

        return new JsonObject
        {
            ["ok"] = true,
            ["health"] = health,
            ["baseUrl"] = normalizedBase,
            ["models"] = new JsonArray(models.Select(x => x.DeepClone()).ToArray()),
            ["cloudCatalogOk"] = cloudCatalogOk,
            ["localOk"] = localOk,
            ["warning"] = warning,
            ["error"] = null,
        };
    }

    public static bool ModelIsConfigured(IEnumerable<JsonObject> models, string configuredModel)
    {
        var target = configuredModel.Trim();
        if (string.IsNullOrEmpty(target))
        {
            return models.Any();
        }

        var key = ModelKey(target);
        return models.Any(m => ModelKey(m["name"]?.GetValue<string>() ?? "") == key);
    }

    public static bool ModelsSupportTools(IEnumerable<JsonObject> models)
        => models.Any(m => m["capabilities"] is JsonArray caps && caps.Any(c => c?.GetValue<string>() == "tools"));

    private async Task<JsonObject?> FetchJsonAsync(
        HttpClient http,
        string url,
        TimeSpan timeout,
        string probeKind,
        CancellationToken cancellationToken)
    {
        try
        {
            using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            cts.CancelAfter(timeout);
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.TryAddWithoutValidation("Accept", "application/json");
            using var response = await http.SendAsync(request, cts.Token);
            response.EnsureSuccessStatusCode();
            return await response.Content.ReadFromJsonAsync<JsonObject>(cancellationToken: cts.Token);
        }
        catch (Exception ex) when (IsExpectedProbeFailure(ex))
        {
            logger.LogDebug(ex, "Ollama {ProbeKind} probe failed for {Url}", probeKind, url);
            return null;
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Ollama {ProbeKind} probe failed for {Url}", probeKind, url);
            return null;
        }
    }

    private static bool IsExpectedProbeFailure(Exception ex)
    {
        for (var current = ex; current is not null; current = current.InnerException)
        {
            if (current is HttpRequestException or SocketException or TaskCanceledException)
            {
                return true;
            }
        }

        return false;
    }

    private static JsonObject? NormalizeLocalModel(JsonNode? raw)
    {
        if (raw is not JsonObject obj)
        {
            return null;
        }

        var name = (obj["name"]?.GetValue<string>() ?? "").Trim();
        if (string.IsNullOrEmpty(name))
        {
            return null;
        }

        var cloud = obj["remote_host"] is not null || IsCloudModelRef(name);
        var details = obj["details"] as JsonObject;
        JsonArray? capabilities = obj["capabilities"] as JsonArray;
        return WithBilling(new JsonObject
        {
            ["name"] = name,
            ["source"] = cloud ? "cloud" : "local",
            ["installed"] = true,
            ["capabilities"] = capabilities?.DeepClone(),
            ["context_length"] = details?["context_length"]?.DeepClone(),
        });
    }

    private static JsonObject? NormalizeCatalogModel(JsonNode? raw)
    {
        if (raw is not JsonObject obj)
        {
            return null;
        }

        var baseName = (obj["name"]?.GetValue<string>() ?? "").Trim();
        if (string.IsNullOrEmpty(baseName))
        {
            return null;
        }

        return WithBilling(new JsonObject
        {
            ["name"] = ToCloudModelRef(baseName),
            ["source"] = "cloud",
            ["installed"] = false,
        });
    }

    private static List<JsonObject> MergeOllamaModels(IReadOnlyList<JsonObject> local, IReadOnlyList<JsonObject> cloudCatalog)
    {
        var byKey = new Dictionary<string, JsonObject>(StringComparer.OrdinalIgnoreCase);
        foreach (var model in cloudCatalog)
        {
            byKey[ModelKey(model["name"]?.GetValue<string>() ?? "")] = JsonNodeCopy.CloneObject(model);
        }

        foreach (var model in local)
        {
            var key = ModelKey(model["name"]?.GetValue<string>() ?? "");
            if (byKey.TryGetValue(key, out var existing))
            {
                var merged = new JsonObject
                {
                    ["name"] = model["name"]?.DeepClone(),
                    ["source"] = model["source"]?.DeepClone(),
                    ["installed"] = true,
                    ["capabilities"] = model["capabilities"]?.DeepClone() ?? existing["capabilities"]?.DeepClone(),
                    ["context_length"] = model["context_length"]?.DeepClone() ?? existing["context_length"]?.DeepClone(),
                };
                byKey[key] = WithBilling(merged);
            }
            else
            {
                byKey[key] = JsonNodeCopy.CloneObject(model);
            }
        }

        return byKey.Values
            .OrderBy(m => m["installed"]?.GetValue<bool?>() == true ? 0 : 1)
            .ThenBy(m => (m["source"]?.GetValue<string>() ?? "") == "local" ? 0 : 1)
            .ThenBy(m => m["name"]?.GetValue<string>() ?? "", StringComparer.Ordinal)
            .ToList();
    }

    private static JsonObject WithBilling(JsonObject entry)
    {
        var tier = ResolveBillingTier(
            entry["name"]?.GetValue<string>() ?? "",
            entry["source"]?.GetValue<string>() ?? "local");
        entry["billing"] = tier["billing"]?.GetValue<string>();
        entry["requires_subscription"] = tier["requires_subscription"]?.GetValue<bool>() ?? false;
        return entry;
    }

    public static bool IsCloudModelRef(string name)
        => name.EndsWith("-cloud", StringComparison.Ordinal) || name.EndsWith(":cloud", StringComparison.Ordinal);

    public static string ToCloudModelRef(string name)
    {
        var trimmed = name.Trim();
        if (string.IsNullOrEmpty(trimmed) || IsCloudModelRef(trimmed))
        {
            return trimmed;
        }

        return trimmed.Contains(':') ? $"{trimmed}-cloud" : $"{trimmed}:cloud";
    }

    public static JsonObject ResolveBillingTier(string name, string source)
    {
        var cloud = source == "cloud" || IsCloudModelRef(name);
        if (!cloud)
        {
            return new JsonObject { ["billing"] = "free_local", ["requires_subscription"] = false };
        }

        if (ProCloudModelPatterns.Any(p => p.IsMatch(name)))
        {
            return new JsonObject { ["billing"] = "cloud_pro", ["requires_subscription"] = true };
        }

        return new JsonObject { ["billing"] = "cloud_free", ["requires_subscription"] = true };
    }

    private static string ModelKey(string name) => name.ToLowerInvariant();
}
