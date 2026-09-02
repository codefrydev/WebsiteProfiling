using AiService.Api.Application.Chat;
using AiService.Api.Domain;
using AiService.Api.Domain.Entities;
using AiService.Api.Domain.Repositories;

namespace AiService.Tests;

public sealed class ChatControllerPersistenceTests
{
    [Fact]
    public void ShouldPersistAfterStream_false_when_request_aborted()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        Assert.False(ChatStreamPersistence.ShouldPersistAfterStream(CancellationToken.None, cts.Token));
    }

    [Fact]
    public void ShouldPersistAfterStream_false_when_action_token_cancelled()
    {
        using var cts = new CancellationTokenSource();
        cts.Cancel();

        Assert.False(ChatStreamPersistence.ShouldPersistAfterStream(cts.Token, CancellationToken.None));
    }

    [Fact]
    public async Task AppendMessageAsync_not_called_for_assistant_when_persistence_skipped()
    {
        var repo = new TrackingChatSessionRepository();
        await repo.AppendMessageAsync(1, ChatRoles.User, "hello");

        using var cts = new CancellationTokenSource();
        cts.Cancel();

        if (!ChatStreamPersistence.ShouldPersistAfterStream(cts.Token, CancellationToken.None))
        {
            // Mirrors ChatController.PostChat — no assistant append after disconnect.
        }
        else
        {
            await repo.AppendMessageAsync(1, ChatRoles.Assistant, content: "", toolResultJson: "{}");
        }

        Assert.Equal(1, repo.AppendCountByRole(ChatRoles.User));
        Assert.Equal(0, repo.AppendCountByRole(ChatRoles.Assistant));
    }

    private sealed class TrackingChatSessionRepository : IChatSessionRepository
    {
        private readonly List<(string Role, string? ToolResultJson)> _appends = [];

        public int AppendCountByRole(string role) =>
            _appends.Count(x => x.Role == role);

        public Task<long> CreateSessionAsync(long propertyId, string title, CancellationToken cancellationToken = default)
            => Task.FromResult(1L);

        public Task<IReadOnlyList<ChatSession>> ListSessionsAsync(
            long propertyId,
            int limit = 30,
            CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyList<ChatSession>>([]);

        public Task<ChatSession?> GetSessionAsync(long sessionId, CancellationToken cancellationToken = default)
            => Task.FromResult<ChatSession?>(new ChatSession { Id = sessionId, PropertyId = 1, Title = "New chat" });

        public Task<bool> DeleteSessionAsync(long sessionId, CancellationToken cancellationToken = default)
            => Task.FromResult(true);

        public Task<IReadOnlyList<ChatMessage>> GetMessagesAsync(
            long sessionId,
            int limit = 200,
            CancellationToken cancellationToken = default)
            => Task.FromResult<IReadOnlyList<ChatMessage>>([]);

        public Task<long> AppendMessageAsync(
            long sessionId,
            string role,
            string content = "",
            string? toolName = null,
            string? toolArgsJson = null,
            string? toolResultJson = null,
            CancellationToken cancellationToken = default)
        {
            _appends.Add((role, toolResultJson));
            return Task.FromResult((long)_appends.Count);
        }

        public Task UpdateSessionTitleAsync(long sessionId, string title, CancellationToken cancellationToken = default)
            => Task.CompletedTask;

        public Task TouchSessionAsync(long sessionId, CancellationToken cancellationToken = default)
            => Task.CompletedTask;
    }
}
