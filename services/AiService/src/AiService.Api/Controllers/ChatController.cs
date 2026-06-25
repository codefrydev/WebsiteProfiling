using System.Text.Json.Nodes;
using System.Threading.Channels;
using AiService.Application.Chat;
using AiService.Application.Services;
using AiService.Domain.Repositories;
using AiService.Tools.Context;
using AiService.Tools.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace AiService.Api.Controllers;

/// <summary>
/// Chat agent and session endpoints ported from FastAPI's <c>/api/chat/*</c>.
/// </summary>
[ApiController]
[Route("api/chat")]
[Tags("Chat")]
public sealed class ChatController : ControllerBase
{
    private readonly IChatSessionRepository _sessions;
    private readonly ChatAgentService _agent;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IOptions<FastApiOptions> _fastApiOptions;
    private readonly ILogger<ChatController> _logger;

    public ChatController(
        IChatSessionRepository sessions,
        ChatAgentService agent,
        IHttpClientFactory httpClientFactory,
        IOptions<FastApiOptions> fastApiOptions,
        ILogger<ChatController> logger)
    {
        _sessions = sessions;
        _agent = agent;
        _httpClientFactory = httpClientFactory;
        _fastApiOptions = fastApiOptions;
        _logger = logger;
    }

    /// <summary>Run one chat turn with SSE streaming (status, tool_start, tool_end, narrative, error, done).</summary>
    [HttpPost("")]
    [Produces("text/event-stream")]
    public async Task PostChat([FromBody] ChatRequest body, CancellationToken cancellationToken)
    {
        if (body.SessionId == 0 || body.PropertyId == 0 || string.IsNullOrWhiteSpace(body.Message))
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(new { detail = "sessionId, propertyId, and message required" }, cancellationToken);
            return;
        }

        var session = await _sessions.GetSessionAsync(body.SessionId, cancellationToken);
        if (session is null || session.PropertyId != body.PropertyId)
        {
            Response.StatusCode = StatusCodes.Status404NotFound;
            await Response.WriteAsJsonAsync(new { detail = "session not found" }, cancellationToken);
            return;
        }

        await _sessions.AppendMessageAsync(body.SessionId, "user", body.Message.Trim(), cancellationToken: cancellationToken);

        var history = await _sessions.GetMessagesAsync(body.SessionId, cancellationToken: cancellationToken);
        var agentMessages = ChatHelpers.MessagesForAgentContext(history);
        var context = new AuditToolContext
        {
            PropertyId = (int)body.PropertyId,
            ReportId = body.ReportId,
        };

        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";

        var channel = Channel.CreateUnbounded<JsonObject>();
        ChatTurnResult? agentResult = null;

        var agentTask = Task.Run(async () =>
        {
            try
            {
                agentResult = await _agent.RunTurnAsync(
                    agentMessages,
                    context,
                    evt => channel.Writer.TryWrite(ChatSseSerializer.ToJson(evt)),
                    cancellationToken);
            }
            catch (Exception ex)
            {
                channel.Writer.TryWrite(ChatSseSerializer.ToJson(new ChatErrorStreamEvent(ex.Message)));
            }
            finally
            {
                channel.Writer.Complete();
            }
        }, cancellationToken);

        await foreach (var item in channel.Reader.ReadAllAsync(cancellationToken))
        {
            var eventType = item["type"]?.GetValue<string>() ?? "message";
            await Response.WriteAsync($"event: {eventType}\n", cancellationToken);
            await Response.WriteAsync($"data: {item.ToJsonString()}\n\n", cancellationToken);
            await Response.Body.FlushAsync(cancellationToken);
        }

        await agentTask;

        var toolResultJson = agentResult is null ? null : ChatPersistenceMapper.ToToolResultJson(agentResult);
        if (toolResultJson is not null)
        {
            try
            {
                await _sessions.AppendMessageAsync(
                    body.SessionId,
                    "assistant",
                    content: "",
                    toolResultJson: toolResultJson,
                    cancellationToken: cancellationToken);
                if (session.Title is "New chat" or "" or null)
                {
                    var derived = ChatHelpers.DeriveTitle(body.Message)
                        ?? ChatHelpers.DeriveTitle(ChatPersistenceMapper.FirstNarrativeInsight(agentResult!));
                    if (!string.IsNullOrWhiteSpace(derived))
                    {
                        await _sessions.UpdateSessionTitleAsync(body.SessionId, derived, cancellationToken);
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to persist chat assistant message for session {SessionId}", body.SessionId);
            }
        }
    }

    [HttpGet("sessions")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ListSessions([FromQuery] long propertyId, CancellationToken cancellationToken)
    {
        if (propertyId == 0)
        {
            return BadRequest(new { detail = "propertyId required" });
        }

        var sessions = await _sessions.ListSessionsAsync(propertyId, cancellationToken: cancellationToken);
        return Ok(new { sessions = sessions.Select(ChatHelpers.FormatSession).ToList() });
    }

    [HttpPost("sessions")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> CreateSession([FromBody] ChatSessionCreate body, CancellationToken cancellationToken)
    {
        if (body.PropertyId == 0)
        {
            return BadRequest(new { detail = "propertyId required" });
        }

        var title = string.IsNullOrWhiteSpace(body.Title) ? "New chat" : body.Title.Trim();
        var id = await _sessions.CreateSessionAsync(body.PropertyId, title, cancellationToken);
        return Ok(new { id, propertyId = body.PropertyId, title });
    }

    [HttpGet("sessions/{sessionId:long}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetSession(long sessionId, CancellationToken cancellationToken)
    {
        var session = await _sessions.GetSessionAsync(sessionId, cancellationToken);
        if (session is null)
        {
            return NotFound(new { detail = "session not found" });
        }

        return Ok(new { session = ChatHelpers.FormatSession(session) });
    }

    [HttpDelete("sessions/{sessionId:long}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> DeleteSession(
        long sessionId,
        [FromQuery] long propertyId,
        CancellationToken cancellationToken)
    {
        var session = await _sessions.GetSessionAsync(sessionId, cancellationToken);
        if (session is null || session.PropertyId != propertyId)
        {
            return NotFound(new { detail = "session not found" });
        }

        var deleted = await _sessions.DeleteSessionAsync(sessionId, cancellationToken);
        if (!deleted)
        {
            return NotFound(new { detail = "session not found" });
        }

        return Ok(new { ok = true });
    }

    [HttpGet("sessions/{sessionId:long}/messages")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetMessages(
        long sessionId,
        [FromQuery] long propertyId,
        CancellationToken cancellationToken)
    {
        var session = await _sessions.GetSessionAsync(sessionId, cancellationToken);
        if (session is null || session.PropertyId != propertyId)
        {
            return NotFound(new { detail = "session not found" });
        }

        var messages = await _sessions.GetMessagesAsync(sessionId, cancellationToken: cancellationToken);
        return Ok(new { messages = ChatHelpers.FormatMessages(messages) });
    }

    [HttpGet("artifacts/{artifactId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> GetArtifact(string artifactId, CancellationToken cancellationToken)
    {
        if (!System.Text.RegularExpressions.Regex.IsMatch(artifactId, @"^[a-f0-9\-]{36}$"))
        {
            return BadRequest(new { detail = "Invalid artifact id" });
        }

        var baseUrl = _fastApiOptions.Value.BaseUrl.Trim().TrimEnd('/');
        var client = _httpClientFactory.CreateClient();
        using var response = await client.GetAsync(
            $"{baseUrl}/api/chat/artifacts/{artifactId}",
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);

        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return NotFound(new { detail = "Artifact not found" });
        }

        if (!response.IsSuccessStatusCode)
        {
            return StatusCode((int)response.StatusCode, new { detail = "Artifact fetch failed" });
        }

        var bytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        var contentType = response.Content.Headers.ContentType?.MediaType ?? "application/octet-stream";
        var fileResult = File(bytes, contentType);
        if (response.Content.Headers.ContentDisposition is { } disposition)
        {
            fileResult.FileDownloadName = disposition.FileName?.Trim('"');
        }

        return fileResult;
    }

    public sealed class ChatRequest
    {
        public long SessionId { get; set; }

        public long PropertyId { get; set; }

        public int? ReportId { get; set; }

        public string Message { get; set; } = "";
    }

    public sealed class ChatSessionCreate
    {
        public long PropertyId { get; set; }

        public string? Title { get; set; }
    }
}
