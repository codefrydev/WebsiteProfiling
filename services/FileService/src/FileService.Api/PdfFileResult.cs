namespace FileService.Api;

public sealed class PdfFileResult(byte[] bytes, string contentDisposition) : IResult
{
    public Task ExecuteAsync(HttpContext httpContext)
    {
        var response = httpContext.Response;
        response.ContentType = "application/pdf";
        response.Headers.ContentDisposition = contentDisposition;
        response.ContentLength = bytes.Length;
        return response.Body.WriteAsync(bytes).AsTask();
    }
}
