using System.Text;
using System.Text.Json.Nodes;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;
using Microsoft.AspNetCore.Mvc;

namespace AiService.Api.Controllers.Internal;

/// <summary>Internal extraction endpoints — <c>POST /internal/extraction/*</c>.</summary>
[ApiController]
[Route("internal/extraction")]
[Tags("Internal Extraction")]
public sealed class ExtractionController(
    StructuredCompletionService completionService,
    ILlmSettingsRepository configRepository) : ControllerBase
{
    private const int MaxHtmlSamples = 3;
    private const int MaxHtmlSampleChars = 40_000;

    private const string SystemPrompt = """
        You write a single CSS or XPath selector that extracts one field from an HTML page.
        You are given one or more sample pages from the SAME site/template and a plain-language
        description of the field to extract. Respond with a JSON object only, no prose:
        {"type": "css"|"xpath", "selector": "...", "attr": "", "confidence": 0.0-1.0, "rationale": "..."}
        Rules:
        - Prefer CSS selectors; use XPath only when CSS cannot express the match.
        - "attr" is the HTML attribute to read (e.g. "content", "href"); leave it "" to use the element's text.
        - The selector must work across ALL provided samples, not just one.
        - Never invent a selector that isn't grounded in the actual sample HTML provided.
        """;

    [HttpPost("generate-selector")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public async Task<IActionResult> GenerateSelector([FromBody] JsonObject body, CancellationToken cancellationToken)
    {
        var fieldName = (body["field_name"]?.GetValue<string>() ?? "").Trim();
        var description = (body["description"]?.GetValue<string>() ?? "").Trim();

        var htmlSamples = new List<string>();
        if (body["html_samples"] is JsonArray samplesArray)
        {
            foreach (var node in samplesArray)
            {
                var sample = node?.GetValue<string>() ?? "";
                if (string.IsNullOrWhiteSpace(sample))
                {
                    continue;
                }
                htmlSamples.Add(sample.Length > MaxHtmlSampleChars ? sample[..MaxHtmlSampleChars] : sample);
                if (htmlSamples.Count >= MaxHtmlSamples)
                {
                    break;
                }
            }
        }

        if (string.IsNullOrEmpty(fieldName) || string.IsNullOrEmpty(description) || htmlSamples.Count == 0)
        {
            return Ok(new JsonObject
            {
                ["ok"] = false,
                ["error"] = "field_name, description, and at least one html_samples entry are required.",
            });
        }

        var previousSelector = body["previous_selector"] as JsonObject;
        var previousSelectorFailed = body["previous_selector_failed"]?.GetValue<bool>() ?? false;

        var user = new StringBuilder();
        user.AppendLine($"Field name: {fieldName}");
        user.AppendLine($"Field description: {description}");
        if (previousSelector is not null)
        {
            var verb = previousSelectorFailed ? "failed to match a real page" : "was used before";
            user.AppendLine($"A previously generated selector {verb}: {previousSelector.ToJsonString()}. Generate a better one.");
        }
        user.AppendLine();
        for (var i = 0; i < htmlSamples.Count; i++)
        {
            user.AppendLine($"--- Sample {i + 1} ---");
            user.AppendLine(htmlSamples[i]);
        }

        try
        {
            var settings = await configRepository.LoadAsync(cancellationToken);
            var result = await completionService.CompleteJsonAsync(SystemPrompt, user.ToString(), settings, cancellationToken);

            var type = result["type"]?.GetValue<string>()?.Trim().ToLowerInvariant() ?? "";
            var selector = result["selector"]?.GetValue<string>()?.Trim() ?? "";
            if (type is not ("css" or "xpath") || string.IsNullOrEmpty(selector))
            {
                return Ok(new JsonObject { ["ok"] = false, ["error"] = "Model did not return a valid selector." });
            }

            return Ok(new JsonObject
            {
                ["ok"] = true,
                ["type"] = type,
                ["selector"] = selector,
                ["attr"] = result["attr"]?.GetValue<string>() ?? "",
                ["confidence"] = result["confidence"]?.GetValue<double>() ?? 0.0,
                ["rationale"] = result["rationale"]?.GetValue<string>() ?? "",
            });
        }
        catch (Exception ex)
        {
            return Ok(new JsonObject { ["ok"] = false, ["error"] = ex.Message });
        }
    }
}
