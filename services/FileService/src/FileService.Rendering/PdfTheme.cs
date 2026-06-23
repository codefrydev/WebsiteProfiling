using FileService.Domain.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace FileService.Rendering;

public static class PdfTheme
{
    public const float Margin = 40;
    public const float BodySize = 10;
    public const float SectionSize = 14;
    public const float CoverTitleSize = 28;
    public const string TextColor = "#1e293b";
    public const string MutedColor = "#64748b";
    public const string MutedBg = "#f1f5f9";
    public const string AccentColor = "#2563eb";
    public const string DividerColor = "#1e40af";
    public const string CoverBandColor = "#1e3a8a";

    public static readonly Dictionary<string, string> PriorityColors = new(StringComparer.OrdinalIgnoreCase)
    {
        ["critical"] = "#dc2626",
        ["high"] = "#ea580c",
        ["medium"] = "#ca8a04",
        ["low"] = "#64748b",
    };

    public static string ScoreColor(int? score) => score switch
    {
        >= 80 => "#16a34a",
        >= 60 => "#ca8a04",
        _ => "#dc2626",
    };

    public static void ComposeContentFooter(IContainer container, AuditReportModel model, int pageNumber)
    {
        container.Row(row =>
        {
            row.RelativeItem().AlignLeft().Text(model.SiteName).FontSize(8).FontColor(MutedColor);
            row.RelativeItem().AlignCenter().Text(text =>
            {
                text.DefaultTextStyle(x => x.FontSize(8).FontColor(MutedColor));
                text.Span("Confidential — prepared for client review. ");
                text.Span($"Exported {model.ExportedAt}");
            });
            row.RelativeItem().AlignRight().Text($"Page {pageNumber}").FontSize(8).FontColor(MutedColor);
        });
    }

    public static void ComposeContentHeader(IContainer container, AuditReportModel model)
    {
        container.Row(row =>
        {
            if (model.Branding.Enabled && model.Branding.LogoBytes is { Length: > 0 })
            {
                row.ConstantItem(48).Height(24).Image(model.Branding.LogoBytes).FitArea();
            }
            else if (model.Branding.Enabled && !string.IsNullOrWhiteSpace(model.Branding.AgencyName))
            {
                row.AutoItem().Text(model.Branding.AgencyName).FontSize(9).Bold().FontColor(MutedColor);
            }
            row.RelativeItem().AlignRight().Text(model.ReportTitle).FontSize(8).FontColor(MutedColor);
        });
    }

    public static void SectionTitle(IContainer container, string title)
    {
        container.PaddingTop(12).PaddingBottom(6).Text(title)
            .FontSize(SectionSize)
            .Bold()
            .FontColor(TextColor);
    }

    public static void SectionDivider(IContainer container, int chapterNumber, string title)
    {
        container.PaddingVertical(16).Background(CoverBandColor).Padding(20).Row(row =>
        {
            row.AutoItem().Text($"{chapterNumber:D2}").FontSize(24).Bold().FontColor(Colors.White);
            row.RelativeItem().PaddingLeft(12).AlignMiddle().Text(title).FontSize(18).Bold().FontColor(Colors.White);
        });
    }

    public static void PriorityBadge(IContainer container, string priority)
    {
        var color = PriorityColors.GetValueOrDefault(priority.ToLowerInvariant(), MutedColor);
        container
            .Background(color)
            .PaddingHorizontal(6)
            .PaddingVertical(2)
            .Text(priority.ToUpperInvariant())
            .FontSize(8)
            .Bold()
            .FontColor(Colors.White);
    }

    public static void CalloutBox(IContainer container, Action<ColumnDescriptor> content)
    {
        container.Background(MutedBg).BorderLeft(4).BorderColor(AccentColor).Padding(12).Column(content);
    }
}
