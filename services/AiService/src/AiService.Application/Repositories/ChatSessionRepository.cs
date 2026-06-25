using AiService.Application.Persistence;
using AiService.Domain.Entities;
using AiService.Domain.Repositories;
using Microsoft.EntityFrameworkCore;

namespace AiService.Application.Repositories;

public sealed class ChatSessionRepository(AiDbContext db) : IChatSessionRepository
{
    public async Task<long> CreateSessionAsync(long propertyId, string title, CancellationToken cancellationToken = default)
    {
        var now = DateTimeOffset.UtcNow;
        var session = new ChatSession
        {
            PropertyId = propertyId,
            Title = string.IsNullOrWhiteSpace(title) ? "New chat" : title.Trim(),
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.ChatSessions.Add(session);
        await db.SaveChangesAsync(cancellationToken);
        return session.Id;
    }

    public async Task<IReadOnlyList<ChatSession>> ListSessionsAsync(
        long propertyId,
        int limit = 30,
        CancellationToken cancellationToken = default)
    {
        var capped = Math.Clamp(limit, 1, 100);
        return await db.ChatSessions.AsNoTracking()
            .Where(x => x.PropertyId == propertyId)
            .OrderByDescending(x => x.UpdatedAt)
            .Take(capped)
            .ToListAsync(cancellationToken);
    }

    public async Task<ChatSession?> GetSessionAsync(long sessionId, CancellationToken cancellationToken = default)
        => await db.ChatSessions.AsNoTracking().FirstOrDefaultAsync(x => x.Id == sessionId, cancellationToken);

    public async Task<bool> DeleteSessionAsync(long sessionId, CancellationToken cancellationToken = default)
    {
        var session = await db.ChatSessions.FirstOrDefaultAsync(x => x.Id == sessionId, cancellationToken);
        if (session is null)
        {
            return false;
        }

        db.ChatSessions.Remove(session);
        await db.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(
        long sessionId,
        int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var capped = Math.Clamp(limit, 1, 500);
        return await db.ChatMessages.AsNoTracking()
            .Where(x => x.SessionId == sessionId)
            .OrderBy(x => x.CreatedAt)
            .Take(capped)
            .ToListAsync(cancellationToken);
    }

    public async Task<long> AppendMessageAsync(
        long sessionId,
        string role,
        string content = "",
        string? toolName = null,
        string? toolArgsJson = null,
        string? toolResultJson = null,
        CancellationToken cancellationToken = default)
    {
        var message = new ChatMessage
        {
            SessionId = sessionId,
            Role = role,
            Content = content ?? "",
            ToolName = toolName,
            ToolArgs = toolArgsJson,
            ToolResult = toolResultJson,
            CreatedAt = DateTimeOffset.UtcNow,
        };
        db.ChatMessages.Add(message);
        await TouchSessionAsync(sessionId, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return message.Id;
    }

    public async Task UpdateSessionTitleAsync(long sessionId, string title, CancellationToken cancellationToken = default)
    {
        var session = await db.ChatSessions.FirstOrDefaultAsync(x => x.Id == sessionId, cancellationToken);
        if (session is null)
        {
            return;
        }

        session.Title = string.IsNullOrWhiteSpace(title) ? "New chat" : title.Trim();
        session.UpdatedAt = DateTimeOffset.UtcNow;
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task TouchSessionAsync(long sessionId, CancellationToken cancellationToken = default)
    {
        var session = await db.ChatSessions.FirstOrDefaultAsync(x => x.Id == sessionId, cancellationToken);
        if (session is null)
        {
            return;
        }

        session.UpdatedAt = DateTimeOffset.UtcNow;
    }
}
