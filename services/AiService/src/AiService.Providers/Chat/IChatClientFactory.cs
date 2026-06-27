using AiService.Domain.Models;
using Microsoft.Extensions.AI;

namespace AiService.Providers.Chat;

public interface IChatClientFactory
{
    Task<IChatClient> CreateFromConfigAsync(CancellationToken cancellationToken = default);

    IChatClient CreateClient(LlmSettings settings);
}
