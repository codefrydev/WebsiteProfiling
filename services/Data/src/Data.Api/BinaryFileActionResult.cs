using Microsoft.AspNetCore.Mvc;

namespace Data.Api;

/// <summary>
/// Writes raw bytes with an explicit content type and Content-Disposition header — ported from
/// FileService's minimal-API <c>BinaryFileResult</c> so export responses (PDF/workbook/CSV/JSON/sitemap)
/// keep byte-identical headers under MVC (<c>ControllerBase.File()</c> always attaches a filename when
/// one is given, which doesn't reproduce the bare "inline" disposition this API has always returned).
/// </summary>
public sealed class BinaryFileActionResult(byte[] bytes, string contentType, string contentDisposition) : IActionResult
{
    public Task ExecuteResultAsync(ActionContext context)
    {
        var response = context.HttpContext.Response;
        response.ContentType = contentType;
        response.Headers.ContentDisposition = contentDisposition;
        response.ContentLength = bytes.Length;
        return response.Body.WriteAsync(bytes).AsTask();
    }
}
