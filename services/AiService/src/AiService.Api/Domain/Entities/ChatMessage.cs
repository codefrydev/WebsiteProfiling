namespace AiService.Api.Domain.Entities;

public sealed class ChatMessage
{
    public long Id { get; set; }

    public long SessionId { get; set; }

    public ChatSession Session { get; set; } = null!;

    public string Role { get; set; } = ChatRoles.User;

    public string Content { get; set; } = "";

    public string? ToolName { get; set; }

    public string? ToolArgs { get; set; }

    public string? ToolResult { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
