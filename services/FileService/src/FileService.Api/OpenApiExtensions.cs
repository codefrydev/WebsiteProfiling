namespace FileService.Api;

internal static class OpenApiExtensions
{
    internal static RouteHandlerBuilder WithPdfOpenApi(
        this RouteHandlerBuilder builder,
        string summary,
        string description)
    {
        return builder
            .WithSummary(summary)
            .WithDescription(description)
            .WithTags("Reports")
            .Produces(StatusCodes.Status200OK, contentType: "application/pdf")
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status502BadGateway);
    }

    internal static RouteHandlerBuilder WithWorkbookOpenApi(
        this RouteHandlerBuilder builder,
        string summary,
        string description)
    {
        return builder
            .WithSummary(summary)
            .WithDescription(description)
            .WithTags("Reports")
            .Produces(StatusCodes.Status200OK, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            .Produces(StatusCodes.Status404NotFound)
            .Produces(StatusCodes.Status502BadGateway);
    }
}
