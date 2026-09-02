using System.Text.Json;
using ClosedXML.Excel;
using CoreService.Api.Rendering;

namespace CoreService.Tests;

public class AuditWorkbookGeneratorTests
{
    private static JsonElement LoadFixture(string name)
    {
        var json = File.ReadAllText(Path.Combine("fixtures", name));
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.Clone();
    }

    [Fact]
    public void Generate_contains_expected_sheets()
    {
        var generator = new AuditWorkbookGenerator();
        var bytes = generator.Generate(LoadFixture("full-payload.json"));

        using var stream = new MemoryStream(bytes);
        using var workbook = new XLWorkbook(stream);
        var names = workbook.Worksheets.Select(w => w.Name).ToHashSet(StringComparer.Ordinal);

        Assert.Contains("Internal URLs", names);
        Assert.Contains("Links", names);
        Assert.Contains("Issues", names);
        Assert.Contains("Redirects", names);
        Assert.Contains("Custom Fields", names);
    }

    [Fact]
    public void Generate_custom_fields_sheet_has_dynamic_columns()
    {
        var generator = new AuditWorkbookGenerator();
        var bytes = generator.Generate(LoadFixture("full-payload.json"));

        using var stream = new MemoryStream(bytes);
        using var workbook = new XLWorkbook(stream);
        var sheet = workbook.Worksheet("Custom Fields");
        var headerRow = sheet.Row(1).Cells().Select(c => c.GetString()).ToList();

        Assert.Contains("price", headerRow);
        Assert.Contains("sku", headerRow);
        Assert.Contains("9.99", sheet.CellsUsed().Select(c => c.GetString()).Where(s => s is not null));
    }

    [Fact]
    public void Generate_minimal_payload_produces_internal_urls_only()
    {
        var generator = new AuditWorkbookGenerator();
        var bytes = generator.Generate(LoadFixture("minimal-payload.json"));

        using var stream = new MemoryStream(bytes);
        using var workbook = new XLWorkbook(stream);

        var names = workbook.Worksheets.Select(w => w.Name).ToList();
        Assert.Equal(2, workbook.Worksheets.Count);
        Assert.Contains("Internal URLs", names);
        Assert.Contains("Issues", names);
    }
}
