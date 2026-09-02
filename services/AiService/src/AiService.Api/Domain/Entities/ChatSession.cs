namespace AiService.Api.Domain.Entities;

public sealed class ChatSession
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public string Title { get; set; } = "New chat";

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }

    public ICollection<ChatMessage> Messages { get; set; } = new List<ChatMessage>();
}
