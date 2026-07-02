using Data.Domain.Models;
using Data.Rendering.Sections;

namespace Data.Rendering.Composition;

public static class SectionRegistry
{
    private static readonly IPdfSectionComposer[] AllComposers =
    [
        new TableOfContentsSection(),
        new ScoreDashboardSection(),
        new AuditSnapshotSection(),
        new ExecutiveNarrativeSection(),
        new FindingsSection(),
        new LighthouseChapterSection(),
        new SearchVisibilitySection(),
        new TrafficSnapshotSection(),
        new SecurityChapterSection(),
        new ContentChapterSection(),
        new IndexationChapterSection(),
        new AppendixSection(),
    ];

    private static readonly Dictionary<PdfSectionId, IPdfSectionComposer> ById =
        AllComposers.ToDictionary(c => c.SectionId);

    public static IReadOnlyList<PdfSectionId> ResolveSectionOrder(PdfProfile profile, AuditReportModel model)
    {
        var ids = profile switch
        {
            PdfProfile.Executive => new[]
            {
                PdfSectionId.ScoreDashboard,
                PdfSectionId.ExecutiveNarrative,
                PdfSectionId.Findings,
            },
            PdfProfile.Standard => new[]
            {
                PdfSectionId.TableOfContents,
                PdfSectionId.ScoreDashboard,
                PdfSectionId.AuditSnapshot,
                PdfSectionId.Findings,
                PdfSectionId.Appendix,
            },
            PdfProfile.Full => new[]
            {
                PdfSectionId.TableOfContents,
                PdfSectionId.ScoreDashboard,
                PdfSectionId.AuditSnapshot,
                PdfSectionId.ExecutiveNarrative,
                PdfSectionId.Findings,
                PdfSectionId.Lighthouse,
                PdfSectionId.SearchVisibility,
                PdfSectionId.TrafficSnapshot,
                PdfSectionId.Security,
                PdfSectionId.Content,
                PdfSectionId.Indexation,
                PdfSectionId.Appendix,
            },
            PdfProfile.Premium => new[]
            {
                PdfSectionId.TableOfContents,
                PdfSectionId.ScoreDashboard,
                PdfSectionId.ExecutiveNarrative,
                PdfSectionId.Findings,
                PdfSectionId.Lighthouse,
                PdfSectionId.SearchVisibility,
                PdfSectionId.TrafficSnapshot,
                PdfSectionId.Security,
                PdfSectionId.Content,
                PdfSectionId.Indexation,
                PdfSectionId.Appendix,
            },
            _ => new[] { PdfSectionId.Findings, PdfSectionId.Appendix },
        };

        return ids.Where(id => ById[id].IsAvailable(new PdfRenderContext { Model = model, Profile = profile })).ToList();
    }

    public static IPdfSectionComposer Get(PdfSectionId id) => ById[id];

    public static IEnumerable<IPdfSectionComposer> GetComposers(PdfProfile profile, AuditReportModel model)
    {
        foreach (var id in ResolveSectionOrder(profile, model))
        {
            yield return ById[id];
        }
    }
}
