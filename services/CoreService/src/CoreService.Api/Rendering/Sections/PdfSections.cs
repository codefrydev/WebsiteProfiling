using CoreService.Api.Domain.Data.Models;
using CoreService.Api.Rendering.Charts;
using CoreService.Api.Rendering.Composition;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;
using WebsiteProfiling.Contracts.Report;

namespace CoreService.Api.Rendering.Sections;

public sealed class TableOfContentsSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.TableOfContents;
    public string Title => "Contents";

    public bool IsAvailable(PdfRenderContext context) =>
        context.Model.TableOfContents.Count > 0;

    public void Compose(IContainer container, PdfRenderContext context)
    {
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, "Table of contents"));
            var n = 1;
            foreach (var entry in context.Model.TableOfContents)
            {
                var num = n++;
                column.Item().PaddingVertical(4).Row(row =>
                {
                    row.AutoItem().Width(24).Text($"{num}.").FontSize(PdfTheme.BodySize);
                    row.RelativeItem().Text(entry.Title).FontSize(PdfTheme.BodySize);
                });
            }
        });
    }
}

public sealed class ScoreDashboardSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.ScoreDashboard;
    public string Title => "Score overview";

    public bool IsAvailable(PdfRenderContext context) => context.Model.CategoryScores.Count > 0;

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var model = context.Model;
        container.Column(column =>
        {
            if (context.Profile is not PdfProfile.Premium and not PdfProfile.Full)
            {
                column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            }

            foreach (var chunk in model.CategoryScores.Chunk(2))
            {
                column.Item().PaddingBottom(8).Row(row =>
                {
                    foreach (var cat in chunk)
                    {
                        row.RelativeItem().Padding(4).Border(1).BorderColor("#e2e8f0").Padding(10).Column(c =>
                        {
                            c.Item().Text(cat.Name).FontSize(9).FontColor(PdfTheme.MutedColor);
                            c.Item().Row(r =>
                            {
                                r.AutoItem().Text(cat.Score?.ToString() ?? "—").FontSize(22).Bold()
                                    .FontColor(PdfTheme.ScoreColor(cat.Score));
                                if (cat.IssueCount > 0)
                                {
                                    r.RelativeItem().AlignMiddle().PaddingLeft(8).Text($"{cat.IssueCount} issues")
                                        .FontSize(8).FontColor(PdfTheme.MutedColor);
                                }
                            });
                            if (cat.Score is not null)
                            {
                                c.Item().PaddingTop(6).Element(e => HorizontalBarChart.Compose(e, cat.Score.Value));
                            }
                        });
                    }
                });
            }

            if (model.Snapshot is not null)
            {
                column.Item().PaddingTop(8).Row(row =>
                {
                    AddKpi(row, "Pages crawled", model.CrawlScope?.PagesCrawled?.ToString() ?? "—");
                    AddKpi(row, "Total URLs", model.Snapshot.TotalUrls?.ToString() ?? "—");
                    AddKpi(row, "Indexable", model.Snapshot.IndexableUrls?.ToString() ?? "—");
                    AddKpi(row, "Total issues", model.Snapshot.TotalIssues?.ToString() ?? "—");
                });
            }
        });
    }

    private static void AddKpi(RowDescriptor row, string label, string value)
    {
        row.RelativeItem().Padding(4).Background(PdfTheme.MutedBg).Padding(8).Column(c =>
        {
            c.Item().Text(label).FontSize(8).FontColor(PdfTheme.MutedColor);
            c.Item().Text(value).FontSize(14).Bold();
        });
    }
}

public sealed class AuditSnapshotSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.AuditSnapshot;
    public string Title => "Audit snapshot";

    public bool IsAvailable(PdfRenderContext context) => context.Model.Snapshot is not null;

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var snap = context.Model.Snapshot!;
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            foreach (var (key, val) in SnapshotLines(context.Model, snap))
            {
                column.Item().PaddingVertical(3).Row(row =>
                {
                    row.ConstantItem(140).Text(key).FontSize(9).Bold();
                    row.RelativeItem().Text(val).FontSize(9);
                });
            }
        });
    }

    private static IEnumerable<(string, string)> SnapshotLines(AuditReportModel model, AuditSnapshotModel snap)
    {
        yield return ("Property", model.SiteName);
        if (!string.IsNullOrWhiteSpace(model.GeneratedAt))
        {
            yield return ("Report generated", model.GeneratedAt);
        }
        if (model.DataSources.Count > 0)
        {
            yield return ("Data sources", string.Join(", ", model.DataSources));
        }
        if (model.CrawlScope?.PagesCrawled is not null)
        {
            var scope = $"{model.CrawlScope.PagesCrawled} pages crawled";
            if (model.CrawlScope.MaxPagesConfigured is not null)
            {
                scope += $" (limit {model.CrawlScope.MaxPagesConfigured})";
            }
            yield return ("Crawl scope", scope);
        }
        if (!string.IsNullOrWhiteSpace(snap.RenderMode))
        {
            yield return ("Render mode", snap.RenderMode);
        }
        if (snap.TotalUrls is not null)
        {
            yield return ("URLs in crawl", snap.TotalUrls.ToString()!);
        }
        if (snap.IndexableUrls is not null)
        {
            yield return ("Indexable URLs", snap.IndexableUrls.ToString()!);
        }
        if (snap.StatusCounts.Count > 0)
        {
            yield return ("HTTP status mix", string.Join(", ", snap.StatusCounts.Select(kv => $"{kv.Key}: {kv.Value}")));
        }
    }
}

public sealed class ExecutiveNarrativeSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.ExecutiveNarrative;
    public string Title => "Executive summary";

    public bool IsAvailable(PdfRenderContext context)
    {
        var e = context.Model.ExecutiveSummary;
        return !string.IsNullOrWhiteSpace(e.Summary) || e.Priorities.Count > 0;
    }

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var exec = context.Model.ExecutiveSummary;
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            column.Item().Element(c => PdfTheme.CalloutBox(c, col =>
            {
                if (!string.IsNullOrWhiteSpace(exec.SourceLabel))
                {
                    col.Item().Text($"Source: {exec.SourceLabel}").FontSize(8).FontColor(PdfTheme.MutedColor);
                }
                if (!string.IsNullOrWhiteSpace(exec.Summary))
                {
                    col.Item().PaddingTop(4).Text(exec.Summary).FontSize(PdfTheme.BodySize).LineHeight(1.4f);
                }
            }));
            if (exec.Priorities.Count > 0)
            {
                column.Item().PaddingTop(10).Text("Priorities").FontSize(11).Bold();
                var i = 1;
                foreach (var p in exec.Priorities)
                {
                    column.Item().PaddingLeft(8).Text($"{i++}. {p}").FontSize(PdfTheme.BodySize);
                }
            }
        });
    }
}

public sealed class FindingsSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.Findings;
    public string Title => "Findings";

    public bool IsAvailable(PdfRenderContext context)
    {
        if (context.Profile == PdfProfile.Executive)
        {
            return context.Model.ExecutiveSummary.TopIssues.Count > 0;
        }
        return context.Model.Issues.Count > 0;
    }

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var issues = context.Profile == PdfProfile.Executive
            ? context.Model.ExecutiveSummary.TopIssues
            : context.Model.Issues;

        container.Column(column =>
        {
            if (context.Profile is not PdfProfile.Premium and not PdfProfile.Full)
            {
                column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            }

            foreach (var note in context.Model.TruncationNotes)
            {
                column.Item().PaddingBottom(6).Text(note).FontSize(9).Italic().FontColor(PdfTheme.MutedColor);
            }

            if (context.Profile == PdfProfile.Executive)
            {
                foreach (var issue in issues)
                {
                    column.Item().Element(c => ComposeIssueCard(c, issue, context.Profile));
                }
                return;
            }

            var groups = issues
                .GroupBy(i => i.Priority, StringComparer.OrdinalIgnoreCase)
                .OrderBy(g => PriorityOrder(g.Key));

            foreach (var group in groups)
            {
                IEnumerable<IGrouping<string, IssueRecord>> subGroups;
                if (group.Count() > 8)
                {
                    subGroups = group.GroupBy(i => i.Category).OrderBy(g => g.Key);
                }
                else
                {
                    subGroups = [new SimpleGrouping(group.Key, group)];
                }

                foreach (var sub in subGroups)
                {
                    column.Item().PaddingTop(8).Row(row =>
                    {
                        row.AutoItem().Element(c => PdfTheme.PriorityBadge(c, group.Key));
                        row.AutoItem().PaddingLeft(8).Text(sub.Key == group.Key
                            ? $"{sub.Count()} issue(s)"
                            : $"{group.Key} — {sub.Key}: {sub.Count()}").FontSize(10).Bold();
                    });
                    foreach (var issue in sub)
                    {
                        column.Item().Element(c => ComposeIssueCard(c, issue, context.Profile));
                    }
                }
            }
        });
    }

    private static void ComposeIssueCard(IContainer container, IssueRecord issue, PdfProfile profile)
    {
        var priorityColor = PdfTheme.PriorityColors.GetValueOrDefault(issue.Priority.ToLowerInvariant(), PdfTheme.MutedColor);
        container.PaddingVertical(4).Row(row =>
        {
            row.ConstantItem(4).Background(priorityColor);
            row.RelativeItem().Background(PdfTheme.MutedBg).Padding(8).Column(col =>
            {
                col.Item().Text(issue.Headline.Length > 0 ? issue.Headline : issue.Message).FontSize(PdfTheme.BodySize).Bold();
                if (!string.IsNullOrWhiteSpace(issue.Category))
                {
                    col.Item().Text(issue.Category).FontSize(8).FontColor(PdfTheme.MutedColor);
                }
                if (!string.IsNullOrWhiteSpace(issue.UrlPath) || !string.IsNullOrWhiteSpace(issue.Url))
                {
                    col.Item().Text(issue.UrlPath.Length > 0 ? issue.UrlPath : issue.Url).FontSize(8).FontColor(PdfTheme.AccentColor);
                }
                if (profile is PdfProfile.Premium or PdfProfile.Full &&
                    (issue.GscClicks is not null || issue.GscImpressions is not null))
                {
                    col.Item().Text($"GSC: {issue.GscClicks ?? 0} clicks · {issue.GscImpressions ?? 0} impressions")
                        .FontSize(8).FontColor(PdfTheme.MutedColor);
                }
                if (!string.IsNullOrWhiteSpace(issue.Recommendation))
                {
                    col.Item().PaddingTop(2).Text($"Fix: {issue.Recommendation}").FontSize(9).Italic();
                }
            });
        });
    }

    private static int PriorityOrder(string priority) => priority.ToLowerInvariant() switch
    {
        "critical" => 0,
        "high" => 1,
        "medium" => 2,
        "low" => 3,
        _ => 9,
    };

    private sealed class SimpleGrouping(string key, IEnumerable<IssueRecord> items) : IGrouping<string, IssueRecord>
    {
        public string Key { get; } = key;
        public IEnumerator<IssueRecord> GetEnumerator() => items.GetEnumerator();
        System.Collections.IEnumerator System.Collections.IEnumerable.GetEnumerator() => GetEnumerator();
    }
}

public sealed class LighthouseChapterSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.Lighthouse;
    public string Title => "Lighthouse";

    public bool IsAvailable(PdfRenderContext context) => context.Model.Lighthouse is not null;

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var lh = context.Model.Lighthouse!;
        var s = lh.Summary;
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            if (!string.IsNullOrWhiteSpace(s.Url))
            {
                column.Item().Text(s.Url).FontSize(9).FontColor(PdfTheme.MutedColor);
            }
            if (!string.IsNullOrWhiteSpace(lh.HumanSummary))
            {
                column.Item().PaddingTop(6).Text(lh.HumanSummary).FontSize(9);
            }
            column.Item().PaddingTop(8).Row(row =>
            {
                AddMetric(row, "Performance", s.Performance);
                AddMetric(row, "Accessibility", s.Accessibility);
                AddMetric(row, "Best practices", s.BestPractices);
                AddMetric(row, "SEO", s.Seo);
            });
            if (lh.Diagnostics.Count > 0)
            {
                column.Item().PaddingTop(10).Text("Diagnostics").FontSize(11).Bold();
                foreach (var d in lh.Diagnostics.Take(10))
                {
                    column.Item().PaddingTop(4).Text(d.Title).FontSize(9).Bold();
                    if (!string.IsNullOrWhiteSpace(d.Description))
                    {
                        column.Item().Text(d.Description).FontSize(8).FontColor(PdfTheme.MutedColor);
                    }
                }
            }
        });
    }

    private static void AddMetric(RowDescriptor row, string label, int? value)
    {
        row.RelativeItem().Border(1).BorderColor("#e2e8f0").Padding(8).Column(c =>
        {
            c.Item().Text(label).FontSize(8).FontColor(PdfTheme.MutedColor);
            c.Item().Text(value?.ToString() ?? "—").FontSize(16).Bold().FontColor(PdfTheme.ScoreColor(value));
        });
    }
}

public sealed class SearchVisibilitySection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.SearchVisibility;
    public string Title => "Search visibility";

    public bool IsAvailable(PdfRenderContext context) =>
        context.Model.SearchVisibility is { TopQueries.Count: > 0 } or { TopPages.Count: > 0 };

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var sv = context.Model.SearchVisibility!;
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            if (sv.TopQueries.Count > 0)
            {
                column.Item().PaddingTop(6).Text("Top queries").FontSize(10).Bold();
                ComposeTable(column, sv.TopQueries);
            }
            if (sv.TopPages.Count > 0)
            {
                column.Item().PaddingTop(10).Text("Top pages").FontSize(10).Bold();
                ComposeTable(column, sv.TopPages);
            }
        });
    }

    private static void ComposeTable(ColumnDescriptor column, IReadOnlyList<MetricRowModel> rows)
    {
        foreach (var row in rows)
        {
            column.Item().PaddingVertical(2).Row(r =>
            {
                r.RelativeItem(2).Text(row.Label).FontSize(8);
                r.RelativeItem().AlignRight().Text(row.Value).FontSize(8).Bold();
                if (!string.IsNullOrWhiteSpace(row.Secondary))
                {
                    r.RelativeItem().AlignRight().Text(row.Secondary).FontSize(8).FontColor(PdfTheme.MutedColor);
                }
            });
        }
    }
}

public sealed class TrafficSnapshotSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.TrafficSnapshot;
    public string Title => "Traffic snapshot";

    public bool IsAvailable(PdfRenderContext context) =>
        context.Model.Traffic is { Channels.Count: > 0 } or { Devices.Count: > 0 };

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var t = context.Model.Traffic!;
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            if (t.Channels.Count > 0)
            {
                column.Item().Text("Channels").FontSize(10).Bold();
                foreach (var ch in t.Channels)
                {
                    column.Item().PaddingVertical(3).Row(row =>
                    {
                        row.RelativeItem().Text(ch.Label).FontSize(9);
                        row.AutoItem().Text(ch.Value).FontSize(9).Bold();
                    });
                    if (int.TryParse(ch.Value.Replace(",", ""), out var sessions))
                    {
                        column.Item().Element(c => HorizontalBarChart.Compose(c, Math.Min(sessions, 100), 100));
                    }
                }
            }
        });
    }
}

public sealed class SecurityChapterSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.Security;
    public string Title => "Security";

    public bool IsAvailable(PdfRenderContext context) =>
        context.Model.Security is { Findings.Count: > 0 };

    public void Compose(IContainer container, PdfRenderContext context)
    {
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            foreach (var f in context.Model.Security!.Findings.Take(20))
            {
                column.Item().PaddingVertical(4).BorderBottom(1).BorderColor("#e2e8f0").Column(c =>
                {
                    c.Item().Row(row =>
                    {
                        row.AutoItem().Element(e => PdfTheme.PriorityBadge(e, f.Severity));
                        row.AutoItem().PaddingLeft(6).Text(f.Type).FontSize(9).Bold();
                    });
                    c.Item().Text(f.Message).FontSize(9);
                    if (!string.IsNullOrWhiteSpace(f.Url))
                    {
                        c.Item().Text(f.Url).FontSize(8).FontColor(PdfTheme.AccentColor);
                    }
                });
            }
        });
    }
}

public sealed class ContentChapterSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.Content;
    public string Title => "Content quality";

    public bool IsAvailable(PdfRenderContext context) => context.Model.Content is not null;

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var c = context.Model.Content!;
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            column.Item().Row(row =>
            {
                AddStat(row, "Mean words", c.MeanWordCount?.ToString() ?? "—");
                AddStat(row, "Median words", c.MedianWordCount?.ToString() ?? "—");
                AddStat(row, "Thin pages", c.ThinContentCount?.ToString() ?? "—");
            });
            if (c.TopKeywords.Count > 0)
            {
                column.Item().PaddingTop(10).Text("Top site keywords").FontSize(10).Bold();
                foreach (var kw in c.TopKeywords.Take(15))
                {
                    column.Item().Text($"{kw.Label} ({kw.Value})").FontSize(8);
                }
            }
        });
    }

    private static void AddStat(RowDescriptor row, string label, string value)
    {
        row.RelativeItem().Padding(4).Background(PdfTheme.MutedBg).Padding(8).Column(col =>
        {
            col.Item().Text(label).FontSize(8).FontColor(PdfTheme.MutedColor);
            col.Item().Text(value).FontSize(14).Bold();
        });
    }
}

public sealed class IndexationChapterSection : IPdfSectionComposer
{
    public PdfSectionId SectionId => PdfSectionId.Indexation;
    public string Title => "Indexation";

    public bool IsAvailable(PdfRenderContext context) => context.Model.Indexation is not null;

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var idx = context.Model.Indexation!;
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            column.Item().Row(row =>
            {
                AddStat(row, "Indexable", idx.Indexable?.ToString() ?? "—");
                AddStat(row, "Non-indexable", idx.NonIndexable?.ToString() ?? "—");
                AddStat(row, "Blocked", idx.Blocked?.ToString() ?? "—");
            });
            if (!string.IsNullOrWhiteSpace(idx.Notes))
            {
                column.Item().PaddingTop(8).Text(idx.Notes).FontSize(9);
            }
        });
    }

    private static void AddStat(RowDescriptor row, string label, string value)
    {
        row.RelativeItem().Padding(4).Border(1).BorderColor("#e2e8f0").Padding(8).Column(col =>
        {
            col.Item().Text(label).FontSize(8);
            col.Item().Text(value).FontSize(16).Bold();
        });
    }
}

public sealed class AppendixSection : IPdfSectionComposer
{
    private static readonly (string Term, string Desc)[] Glossary =
    [
        ("Crawl", "URLs fetched by the site spider (status codes, titles, inlinks)."),
        ("Lighthouse", "Lab Core Web Vitals audit (LCP, CLS, TBT, and category scores)."),
        ("Google Search Console", "Queries, pages, clicks, impressions, and average position from GSC."),
        ("Google Analytics 4", "Sessions, users, and engagement from GA4."),
        ("Estimated", "Derived from crawl text only — not Google search volume or rankings."),
        ("AI insights", "Optional LLM summaries — verify before client delivery."),
    ];

    public PdfSectionId SectionId => PdfSectionId.Appendix;
    public string Title => "Appendix";

    public bool IsAvailable(PdfRenderContext context) => context.Profile != PdfProfile.Executive;

    public void Compose(IContainer container, PdfRenderContext context)
    {
        var model = context.Model;
        container.Column(column =>
        {
            column.Item().Element(c => PdfTheme.SectionTitle(c, Title));
            column.Item().Text($"Report ID: {model.ReportId}").FontSize(9);
            column.Item().PaddingTop(8).Text("Data source glossary").FontSize(11).Bold();
            foreach (var (term, desc) in Glossary)
            {
                column.Item().PaddingTop(4).Row(row =>
                {
                    row.ConstantItem(120).Text(term).FontSize(9).Bold();
                    row.RelativeItem().Text(desc).FontSize(8);
                });
            }
            if (model.LinkSamples.Count > 0)
            {
                column.Item().PaddingTop(12).Text("Crawled URLs (sample)").FontSize(11).Bold();
                foreach (var link in model.LinkSamples)
                {
                    column.Item().PaddingTop(3).Row(row =>
                    {
                        row.RelativeItem(3).Text(link.Url).FontSize(7).FontColor(PdfTheme.AccentColor);
                        row.ConstantItem(36).AlignRight().Text(link.Status).FontSize(7).Bold();
                        row.RelativeItem(2).Text(link.Title).FontSize(7).FontColor(PdfTheme.MutedColor);
                    });
                }
            }
        });
    }
}
