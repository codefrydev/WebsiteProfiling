using System;

namespace Schema.Model.Entities;

public partial class ChatSession
{
    public long Id { get; set; }

    public long PropertyId { get; set; }

    public string Title { get; set; } = null!;

    public DateTimeOffset CreatedAt { get; set; }

    public DateTimeOffset UpdatedAt { get; set; }
}
