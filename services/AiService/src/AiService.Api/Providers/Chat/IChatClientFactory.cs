using AiService.Api.Domain.Models;
using Microsoft.Extensions.AI;

namespace AiService.Api.Providers.Chat;

public interface IChatClientFactory
{
    Task<IChatClient> CreateFromConfigAsync(CancellationToken cancellationToken = default);

    IChatClient CreateClient(LlmSettings settings);
}
