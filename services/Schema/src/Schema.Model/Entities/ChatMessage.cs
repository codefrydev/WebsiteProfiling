using System;

namespace Schema.Model.Entities;

public partial class ChatMessage
{
    public long Id { get; set; }

    public long SessionId { get; set; }

    public string Role { get; set; } = null!;

    public string Content { get; set; } = null!;

    public string? ToolName { get; set; }

    public string? ToolArgs { get; set; }

    public string? ToolResult { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
