using FileService.Domain.Models;
using FileService.Rendering.Composition;

namespace FileService.Rendering.Composition;

public static class TocBuilder
{
    private static readonly Dictionary<PdfSectionId, string> Titles = new()
    {
        [PdfSectionId.TableOfContents] = "Contents",
        [PdfSectionId.ScoreDashboard] = "Score overview",
        [PdfSectionId.AuditSnapshot] = "Audit snapshot",
        [PdfSectionId.ExecutiveNarrative] = "Executive summary",
        [PdfSectionId.Findings] = "Findings",
        [PdfSectionId.Lighthouse] = "Lighthouse",
        [PdfSectionId.SearchVisibility] = "Search visibility",
        [PdfSectionId.TrafficSnapshot] = "Traffic snapshot",
        [PdfSectionId.Security] = "Security",
        [PdfSectionId.Content] = "Content quality",
        [PdfSectionId.Indexation] = "Indexation",
        [PdfSectionId.Appendix] = "Appendix",
    };

    public static IReadOnlyList<TocEntryModel> Build(AuditReportModel model, PdfProfile profile)
    {
        var order = SectionRegistry.ResolveSectionOrder(profile, model);
        return order
            .Where(id => id != PdfSectionId.TableOfContents)
            .Select(id => new TocEntryModel { SectionId = id, Title = Titles.GetValueOrDefault(id, id.ToString()) })
            .ToList();
    }
}

public static class AuditReportModelExtensions
{
    public static AuditReportModel WithTableOfContents(this AuditReportModel model, PdfProfile profile)
    {
        var toc = TocBuilder.Build(model, profile);
        if (toc.Count == 0)
        {
            return model;
        }
        return new AuditReportModel
        {
            ReportId = model.ReportId,
            SiteName = model.SiteName,
            ReportTitle = model.ReportTitle,
            GeneratedAt = model.GeneratedAt,
            ExportedAt = model.ExportedAt,
            HealthScore = model.HealthScore,
            ScoreBand = model.ScoreBand,
            TotalIssueCount = model.TotalIssueCount,
            DataSources = model.DataSources,
            Branding = model.Branding,
            ExecutiveSummary = model.ExecutiveSummary,
            CategoryScores = model.CategoryScores,
            Issues = model.Issues,
            IssueCounts = model.IssueCounts,
            Snapshot = model.Snapshot,
            Lighthouse = model.Lighthouse,
            SearchVisibility = model.SearchVisibility,
            Traffic = model.Traffic,
            Security = model.Security,
            Content = model.Content,
            Indexation = model.Indexation,
            LinkSamples = model.LinkSamples,
            TruncationNotes = model.TruncationNotes,
            CrawlScope = model.CrawlScope,
            TableOfContents = toc,
        };
    }
}
