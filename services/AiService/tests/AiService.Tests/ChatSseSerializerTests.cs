using System.Text.Json.Nodes;
using AiService.Application.Chat;

namespace AiService.Tests;

public sealed class ChatSseSerializerTests
{
    [Fact]
    public void Tool_events_include_call_id_and_truncation_metadata()
    {
        var json = ChatSseSerializer.ToJson(new ChatToolEndEvent(
            "call-1",
            "list_issues",
            """{"total":10}""",
            Truncated: true,
            ResultBytes: 4096));

        Assert.Equal("tool_end", json["type"]?.GetValue<string>());
        Assert.Equal("call-1", json["call_id"]?.GetValue<string>());
        Assert.True(json["truncated"]?.GetValue<bool>());
        Assert.Equal(4096, json["result_bytes"]?.GetValue<int>());
    }

    [Fact]
    public void Tool_progress_event_serializes()
    {
        var json = ChatSseSerializer.ToJson(new ChatToolProgressEvent("call-2", "run_technical_workflow", "Running workflow steps…"));
        Assert.Equal("tool_progress", json["type"]?.GetValue<string>());
        Assert.Equal("call-2", json["call_id"]?.GetValue<string>());
    }
}
