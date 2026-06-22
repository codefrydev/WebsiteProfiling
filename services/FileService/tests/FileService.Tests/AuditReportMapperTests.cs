using System.Text.Json;
using FileService.Application.Domain;
using FileService.Application.Mapping;
using FileService.Domain.Models;
using FileService.Rendering.Composition;

namespace FileService.Tests;

public class AuditReportMapperTests
{
    private static readonly PdfBrandingModel NoBranding = new() { Enabled = false };

    [Fact]
    public void Map_minimal_payload_populates_core_fields()
    {
        var json = File.ReadAllText(Path.Combine("fixtures", "minimal-payload.json"));
        using var doc = JsonDocument.Parse(json);
        var model = AuditReportMapper.Map(doc.RootElement, 42, PdfProfile.Standard, NoBranding);

        Assert.Equal(42, model.ReportId);
        Assert.Equal("example.com", model.SiteName);
        Assert.Equal(72, model.HealthScore);
        Assert.Equal(3, model.Issues.Count);
        Assert.Contains(model.Issues, i => i.Priority.Equals("critical", StringComparison.OrdinalIgnoreCase));
        Assert.NotEmpty(model.ExecutiveSummary.Summary);
        Assert.Equal(2, model.CategoryScores.Count);
        Assert.NotEmpty(model.Issues[0].Headline);
    }

    [Fact]
    public void Map_executive_profile_limits_issues()
    {
        var json = File.ReadAllText(Path.Combine("fixtures", "minimal-payload.json"));
        using var doc = JsonDocument.Parse(json);
        var model = AuditReportMapper.Map(doc.RootElement, 1, PdfProfile.Executive, NoBranding);

        Assert.True(model.Issues.Count <= 6);
    }

    [Fact]
    public void Map_full_payload_includes_analytics_chapters()
    {
        var json = File.ReadAllText(Path.Combine("fixtures", "full-payload.json"));
        using var doc = JsonDocument.Parse(json);
        var model = AuditReportMapper.Map(doc.RootElement, 2, PdfProfile.Premium, NoBranding);

        Assert.NotNull(model.Lighthouse);
        Assert.NotNull(model.SearchVisibility);
        Assert.NotNull(model.Traffic);
        Assert.NotNull(model.Security);
        Assert.NotNull(model.Content);
        Assert.NotNull(model.Indexation);
        Assert.Equal(2, model.LinkSamples.Count);
    }
}

public class DomainResolverTests
{
    [Fact]
    public void Matches_canonical_domain()
    {
        var rows = new List<ReportListRow>
        {
            new() { Id = 5, CanonicalDomain = "example.com", SiteName = "Example" },
        };
        Assert.Equal(5, DomainResolver.ResolveReportId(rows, "example.com"));
    }

    [Fact]
    public void Matches_slugified_site_name()
    {
        var rows = new List<ReportListRow>
        {
            new() { Id = 7, CanonicalDomain = null, SiteName = "My Cool Site" },
        };
        Assert.Equal(7, DomainResolver.ResolveReportId(rows, "my-cool-site"));
    }
}

public class TocBuilderTests
{
    [Fact]
    public void Build_standard_profile_includes_findings()
    {
        var json = File.ReadAllText(Path.Combine("fixtures", "minimal-payload.json"));
        using var doc = JsonDocument.Parse(json);
        var model = AuditReportMapper.Map(doc.RootElement, 1, PdfProfile.Standard, new PdfBrandingModel { Enabled = false })
            .WithTableOfContents(PdfProfile.Standard);

        Assert.Contains(model.TableOfContents, e => e.SectionId == PdfSectionId.Findings);
    }
}
