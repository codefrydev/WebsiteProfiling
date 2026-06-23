namespace FileService.Api;

public sealed class BinaryFileResult(byte[] bytes, string contentType, string contentDisposition) : IResult
{
    public Task ExecuteAsync(HttpContext httpContext)
    {
        var response = httpContext.Response;
        response.ContentType = contentType;
        response.Headers.ContentDisposition = contentDisposition;
        response.ContentLength = bytes.Length;
        return response.Body.WriteAsync(bytes).AsTask();
    }
}
