using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace AiService.Tools.Registry;

/// <summary>
/// Loads the embedded <c>tool_catalog.json</c> and exposes OpenAI-compatible function definitions.
/// Mirrors Python <c>TOOL_DEFINITIONS</c> from <c>tool_catalog.py</c>.
/// </summary>
public sealed class ToolCatalog
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    private readonly IReadOnlyList<JsonObject> _toolDefinitions;
    private readonly IReadOnlyDictionary<string, JsonObject> _byName;

    public ToolCatalog()
    {
        var assembly = typeof(ToolCatalog).Assembly;
        const string resourceName = "AiService.Tools.tool_catalog.json";
        using var stream = assembly.GetManifestResourceStream(resourceName)
            ?? throw new InvalidOperationException($"Embedded resource not found: {resourceName}");

        using var reader = new StreamReader(stream);
        var json = reader.ReadToEnd();
        var entries = JsonSerializer.Deserialize<List<CatalogEntry>>(json, JsonOptions)
            ?? throw new InvalidOperationException("tool_catalog.json did not deserialize.");

        var definitions = new List<JsonObject>(entries.Count);
        var byName = new Dictionary<string, JsonObject>(entries.Count, StringComparer.Ordinal);

        foreach (var entry in entries)
        {
            var definition = new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"] = entry.Name,
                    ["description"] = entry.Description,
                    ["parameters"] = entry.InputSchema?.DeepClone() ?? new JsonObject
                    {
                        ["type"] = "object",
                        ["properties"] = new JsonObject(),
                        ["required"] = new JsonArray(),
                    },
                },
            };

            definitions.Add(definition);
            byName[entry.Name] = definition;
        }

        _toolDefinitions = definitions;
        _byName = byName;
    }

    /// <summary>OpenAI chat-completions tool schema entries (<c>type=function</c>).</summary>
    public IReadOnlyList<JsonObject> ToolDefinitions => _toolDefinitions;

    public bool TryGetDefinition(string toolName, out JsonObject? definition)
        => _byName.TryGetValue(toolName, out definition);

    public IEnumerable<string> ToolNames => _byName.Keys;

    private sealed class CatalogEntry
    {
        public string Name { get; set; } = "";

        public string Description { get; set; } = "";

        [JsonPropertyName("inputSchema")]
        public JsonObject? InputSchema { get; set; }
    }
}
