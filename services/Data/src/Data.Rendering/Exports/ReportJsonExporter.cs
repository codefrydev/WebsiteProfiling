using System.Text.Json;

namespace Data.Rendering.Exports;

/// <summary>
/// JSON export = the report payload, pretty-printed. Mirrors the Python
/// <c>export_audit_json</c> (<c>json.dumps(payload, indent=2)</c>).
/// </summary>
public sealed class ReportJsonExporter
{
    private static readonly JsonSerializerOptions Indented = new() { WriteIndented = true };

    public string Generate(JsonElement payload) => JsonSerializer.Serialize(payload, Indented);
}
