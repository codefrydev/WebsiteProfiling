using CoreService.Api.Domain.Data.Models;
using CoreService.Api.Rendering.Templates;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace CoreService.Api.Rendering;

public sealed class AuditPdfGenerator
{
    public AuditPdfGenerator()
    {
        QuestPDF.Settings.License = LicenseType.Community;
    }

    public byte[] Generate(AuditReportModel model, PdfProfile profile)
    {
        var document = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(0);
                page.Content().Element(c => CoverPageTemplate.Compose(c, model, profile));
            });

            var ctx = new Composition.PdfRenderContext { Model = model, Profile = profile };
            var index = 0;
            foreach (var composer in Composition.SectionRegistry.GetComposers(profile, model))
            {
                index++;
                ctx.SectionIndex = index;
                var showDivider = profile is PdfProfile.Premium or PdfProfile.Full;
                container.Page(page =>
                {
                    page.Size(PageSizes.A4);
                    page.MarginHorizontal(PdfTheme.Margin);
                    page.MarginTop(32);
                    page.MarginBottom(36);
                    page.DefaultTextStyle(x => x.FontSize(PdfTheme.BodySize).FontColor(PdfTheme.TextColor));
                    page.Header().Height(28).Element(c => PdfTheme.ComposeContentHeader(c, model));
                    page.Content().PaddingTop(8).Column(column =>
                    {
                        if (showDivider)
                        {
                            column.Item().Element(c => PdfTheme.SectionDivider(c, index, composer.Title));
                        }
                        column.Item().Element(c => composer.Compose(c, ctx));
                    });
                    page.Footer().Height(24).Element(c =>
                    {
                        c.AlignMiddle().Text(text =>
                        {
                            text.DefaultTextStyle(x => x.FontSize(8).FontColor(PdfTheme.MutedColor));
                            text.Span($"{model.SiteName} · ");
                            text.Span($"Exported {model.ExportedAt} · Page ");
                            text.CurrentPageNumber();
                        });
                    });
                });
            }
        });

        return document.GeneratePdf();
    }
}
