using System.Text.Json;
using System.Text.Json.Nodes;
using WebsiteProfiling.Contracts.Chat;
using WebsiteProfiling.Contracts.Json;

namespace AiService.Api.Application.Chat;

/// <summary>Maps a completed chat turn to the JSON stored in <c>chat_messages.tool_result</c>.</summary>
public static class ChatPersistenceMapper
{
    public static string? ToToolResultJson(ChatTurnResult result)
    {
        if (!result.Ok && result.Narrative is null && result.ToolEvents.Count == 0)
        {
            return null;
        }

        var dto = new PersistedToolResultDto
        {
            Narrative = result.Narrative is { } narrative
                ? new PersistedNarrativeDto
                {
                    PowerInsights = narrative.PowerInsights,
                    RecommendedActions = narrative.RecommendedActions,
                }
                : null,
            ToolEvents = result.ToolEvents.Count > 0
                ? result.ToolEvents.Select(ToPersistedToolEvent).ToList()
                : null,
            AgentError = string.IsNullOrWhiteSpace(result.Error) ? null : result.Error,
        };

        if (dto.Narrative is null && dto.ToolEvents is null && dto.AgentError is null)
        {
            return null;
        }

        return JsonSerializer.Serialize(dto, ContractJsonOptions.Options);
    }

    public static string FirstNarrativeInsight(ChatTurnResult result)
    {
        if (result.Narrative is not { } narrative)
        {
            return "";
        }

        if (narrative.PowerInsights.Count > 0)
        {
            return narrative.PowerInsights[0];
        }

        return narrative.RecommendedActions.Count > 0 ? narrative.RecommendedActions[0] : "";
    }

    private static PersistedToolEventDto ToPersistedToolEvent(ChatToolEvent toolEvent)
        => new()
        {
            Name = toolEvent.Name,
            Args = JsonNode.Parse(toolEvent.ArgsJson),
            Result = JsonNode.Parse(toolEvent.ResultJson),
        };
}
