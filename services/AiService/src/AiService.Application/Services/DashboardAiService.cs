using AiService.Application.Prompts;
using AiService.Domain.Models;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;

namespace AiService.Application.Services;

public sealed class DashboardAiService(
    ILlmSettingsRepository configRepository,
    StructuredCompletionService completionService)
{
    private static readonly HashSet<string> ValidModes = new(StringComparer.OrdinalIgnoreCase)
    {
        "script", "widget", "dashboard",
    };

    public async Task<DashboardAiGenerateResponse> GenerateAsync(
        DashboardAiGenerateRequest request,
        CancellationToken cancellationToken = default)
    {
        var settings = await configRepository.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(settings))
            return DashboardAiGenerateResponse.Failure("AI insights are disabled.", missing: true);

        if (!settings.EnableDashboards)
            return DashboardAiGenerateResponse.Failure("Dashboard AI is disabled in task settings.", missing: true);

        var mode = request.Mode.Trim().ToLowerInvariant();
        if (!ValidModes.Contains(mode))
            return DashboardAiGenerateResponse.Failure($"Unknown mode: '{mode}'. Must be one of: script, widget, dashboard.");

        var prompt = request.Prompt.Trim();
        if (string.IsNullOrEmpty(prompt))
            return DashboardAiGenerateResponse.Failure("prompt is required.");

        try
        {
            var payload = request.ToJsonObject();
            var payloadJson = payload.ToJsonString();
            var user = payloadJson[..Math.Min(payloadJson.Length, 10_000)];

            var result = await completionService.CompleteJsonAsync(
                LlmPrompts.DashboardAiSystem,
                user,
                settings,
                cancellationToken);

            return result.Count == 0 
                ? DashboardAiGenerateResponse.Failure("AI returned no parseable output.") 
                : DashboardAiGenerateResponse.Success(result);
        }
        catch (Exception ex)
        {
            return DashboardAiGenerateResponse.Failure(ex.Message);
        }
    }
}
