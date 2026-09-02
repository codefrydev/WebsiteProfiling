using CoreService.Api.Domain.Data.Models;
using QuestPDF.Infrastructure;

namespace CoreService.Api.Rendering.Composition;

public sealed class PdfRenderContext
{
    public required AuditReportModel Model { get; init; }
    public PdfProfile Profile { get; init; }
    public int SectionIndex { get; set; }
}

public interface IPdfSectionComposer
{
    PdfSectionId SectionId { get; }
    string Title { get; }
    bool IsAvailable(PdfRenderContext context);
    void Compose(IContainer container, PdfRenderContext context);
}
