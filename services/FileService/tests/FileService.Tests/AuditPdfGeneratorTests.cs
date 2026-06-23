using System.Text.Json;
using FileService.Application.Mapping;
using FileService.Domain.Models;
using FileService.Rendering;
using FileService.Rendering.Composition;

namespace FileService.Tests;

public class AuditPdfGeneratorTests
{
    private static readonly PdfBrandingModel NoBranding = new() { Enabled = false };

    [Theory]
    [InlineData(PdfProfile.Executive)]
    [InlineData(PdfProfile.Standard)]
    [InlineData(PdfProfile.Full)]
    [InlineData(PdfProfile.Premium)]
    public void Generate_each_profile_produces_valid_pdf(PdfProfile profile)
    {
        var fixture = profile is PdfProfile.Full or PdfProfile.Premium
            ? "full-payload.json"
            : "minimal-payload.json";
        var json = File.ReadAllText(Path.Combine("fixtures", fixture));
        using var doc = JsonDocument.Parse(json);
        var model = AuditReportMapper.Map(doc.RootElement, 1, profile, NoBranding).WithTableOfContents(profile);

        var generator = new AuditPdfGenerator();
        var bytes = generator.Generate(model, profile);

        Assert.NotEmpty(bytes);
        Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(bytes, 0, 4));
    }

    [Fact]
    public void Generate_with_branding_still_produces_pdf()
    {
        var json = File.ReadAllText(Path.Combine("fixtures", "minimal-payload.json"));
        using var doc = JsonDocument.Parse(json);
        var branding = new PdfBrandingModel
        {
            Enabled = true,
            AgencyName = "Test Agency",
            AgencySubtitle = "SEO Audits",
        };
        var model = AuditReportMapper.Map(doc.RootElement, 1, PdfProfile.Premium, branding).WithTableOfContents(PdfProfile.Premium);

        var bytes = new AuditPdfGenerator().Generate(model, PdfProfile.Premium);
        Assert.True(bytes.Length > 1000);
    }
}
