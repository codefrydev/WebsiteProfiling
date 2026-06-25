using Microsoft.Extensions.AI;

namespace AiService.Providers.Chat;

public interface IChatClientFactory
{
    IChatClient CreateClient(IReadOnlyDictionary<string, string> cfg);

    Task<IChatClient> CreateFromConfigAsync(CancellationToken cancellationToken = default);
}
