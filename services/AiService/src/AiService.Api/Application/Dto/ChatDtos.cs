namespace AiService.Api.Application.Dto;

public sealed class ChatRequest
{
    public long SessionId { get; set; }

    public long PropertyId { get; set; }

    public long? ReportId { get; set; }

    public string Message { get; set; } = "";
}

public sealed class ChatSessionCreate
{
    public long PropertyId { get; set; }

    public string? Title { get; set; }
}
