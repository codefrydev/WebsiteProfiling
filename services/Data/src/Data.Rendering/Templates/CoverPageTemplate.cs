using Data.Domain.Models;
using Data.Rendering.Charts;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace Data.Rendering.Templates;

public static class CoverPageTemplate
{
    public static void Compose(IContainer container, AuditReportModel model, PdfProfile profile)
    {
        container.Column(column =>
        {
            column.Item().Height(120).Background(PdfTheme.CoverBandColor).Padding(32).Column(band =>
            {
                if (model.Branding.Enabled)
                {
                    band.Item().Row(row =>
                    {
                        if (model.Branding.LogoBytes is { Length: > 0 })
                        {
                            row.ConstantItem(80).Height(40).Image(model.Branding.LogoBytes).FitArea();
                        }
                        row.RelativeItem().AlignRight().Column(col =>
                        {
                            if (!string.IsNullOrWhiteSpace(model.Branding.AgencyName))
                            {
                                col.Item().AlignRight().Text(model.Branding.AgencyName).FontSize(11).FontColor(Colors.White);
                            }
                            if (!string.IsNullOrWhiteSpace(model.Branding.AgencySubtitle))
                            {
                                col.Item().AlignRight().Text(model.Branding.AgencySubtitle).FontSize(9).FontColor(Colors.Grey.Lighten2);
                            }
                        });
                    });
                }
                band.Item().PaddingTop(16).Text(model.ReportTitle).FontSize(14).FontColor(Colors.Grey.Lighten2);
            });

            column.Item().Padding(40).Column(body =>
            {
                body.Item().Text(model.SiteName).FontSize(PdfTheme.CoverTitleSize).Bold().FontColor(PdfTheme.TextColor);
                if (!string.IsNullOrWhiteSpace(model.GeneratedAt))
                {
                    body.Item().PaddingTop(8).Text($"Report generated {model.GeneratedAt}").FontSize(11).FontColor(PdfTheme.MutedColor);
                }

                if (model.HealthScore is not null)
                {
                    body.Item().PaddingTop(24).Row(row =>
                    {
                        row.AutoItem().Text(model.HealthScore.ToString()!).FontSize(56).Bold()
                            .FontColor(PdfTheme.ScoreColor(model.HealthScore));
                        row.AutoItem().PaddingLeft(8).AlignBottom().PaddingBottom(8).Text("/ 100").FontSize(18).FontColor(PdfTheme.MutedColor);
                        row.RelativeItem().PaddingLeft(24).AlignMiddle().Column(col =>
                        {
                            col.Item().Text("Site health score").FontSize(12).FontColor(PdfTheme.MutedColor);
                            col.Item().Text(model.ScoreBand).FontSize(16).Bold().FontColor(PdfTheme.ScoreColor(model.HealthScore));
                        });
                    });
                }

                body.Item().PaddingTop(20).Row(row =>
                {
                    foreach (var (priority, count) in model.IssueCounts.Where(kv => kv.Value > 0))
                    {
                        row.AutoItem().PaddingRight(8).Background(PdfTheme.PriorityColors.GetValueOrDefault(priority, PdfTheme.MutedColor))
                            .PaddingHorizontal(10).PaddingVertical(6).Text($"{priority.ToUpperInvariant()}: {count}")
                            .FontSize(9).Bold().FontColor(Colors.White);
                    }
                });

                if (model.TotalIssueCount > 0)
                {
                    body.Item().PaddingTop(12).Text($"{model.TotalIssueCount} findings across {model.CategoryScores.Count} categories")
                        .FontSize(10).FontColor(PdfTheme.MutedColor);
                }
            });

            column.Item().AlignBottom().Padding(32).Column(footer =>
            {
                footer.Item().Text("Confidential — prepared for client review.").FontSize(9).FontColor(PdfTheme.MutedColor);
                if (model.Branding.Enabled && !string.IsNullOrWhiteSpace(model.Branding.AgencyName))
                {
                    footer.Item().PaddingTop(4).Text($"Prepared by {model.Branding.AgencyName}").FontSize(9).Bold();
                }
            });
        });
    }
}
