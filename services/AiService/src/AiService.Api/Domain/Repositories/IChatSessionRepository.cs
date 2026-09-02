using AiService.Api.Domain.Entities;

namespace AiService.Api.Domain.Repositories;

public interface IChatSessionRepository
{
    Task<long> CreateSessionAsync(long propertyId, string title, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ChatSession>> ListSessionsAsync(
        long propertyId,
        int limit = 30,
        CancellationToken cancellationToken = default);

    Task<ChatSession?> GetSessionAsync(long sessionId, CancellationToken cancellationToken = default);

    Task<bool> DeleteSessionAsync(long sessionId, CancellationToken cancellationToken = default);

    Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(
        long sessionId,
        int limit = 200,
        CancellationToken cancellationToken = default);

    Task<long> AppendMessageAsync(
        long sessionId,
        string role,
        string content = "",
        string? toolName = null,
        string? toolArgsJson = null,
        string? toolResultJson = null,
        CancellationToken cancellationToken = default);

    Task UpdateSessionTitleAsync(long sessionId, string title, CancellationToken cancellationToken = default);

    Task TouchSessionAsync(long sessionId, CancellationToken cancellationToken = default);
}
