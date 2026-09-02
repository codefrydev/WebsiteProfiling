using System.Text.Json.Nodes;

namespace AiService.Api.Tools.Registry;

/// <summary>Lightweight catalog entry lookup for MCP list_tools responses.</summary>
public sealed class ToolCatalogEntryLookup(ToolCatalog catalog)
{
    public bool TryGetEntry(string name, out CatalogEntryView entry)
    {
        entry = default!;
        if (!catalog.TryGetDefinition(name, out var definition) || definition is null)
        {
            return false;
        }

        if (definition["function"] is not JsonObject fn)
        {
            return false;
        }

        entry = new CatalogEntryView(
            fn["description"]?.GetValue<string>() ?? "",
            fn["parameters"] as JsonObject);
        return true;
    }
}

public readonly record struct CatalogEntryView(string Description, JsonObject? InputSchema);
