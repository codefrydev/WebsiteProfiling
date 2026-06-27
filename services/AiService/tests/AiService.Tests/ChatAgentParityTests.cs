using System.Text.Json.Nodes;
using AiService.Application.Chat;
using AiService.Application.Prompts;
using AiService.Domain.Models;
using AiService.Tools.Domain;
using AiService.Tools.Selection;

namespace AiService.Tests;

public sealed class ChatAgentParityTests
{
    [Fact]
    public void ResolveSystemPrompt_adds_crawl_suffix_when_enabled()
    {
        var settings = new LlmSettings { ChatAllowCrawl = true };

        var prompt = ChatAgentConfig.ResolveSystemPrompt(settings);
        Assert.Contains(LlmPrompts.ChatAgentCrawlSuffix.Trim(), prompt);
        Assert.DoesNotContain(LlmPrompts.ChatAgentReadOnlySuffix.Trim(), prompt);
    }

    [Fact]
    public void ResolveSystemPrompt_adds_readonly_suffix_when_crawl_disabled()
    {
        var settings = new LlmSettings { ChatAllowCrawl = false };

        var prompt = ChatAgentConfig.ResolveSystemPrompt(settings);
        Assert.Contains(LlmPrompts.ChatAgentReadOnlySuffix.Trim(), prompt);
        Assert.DoesNotContain("prepare_audit_run", prompt);
    }

    [Fact]
    public void ResolveMaxToolRounds_honors_env_overrides()
    {
        var settings = new LlmSettings { ChatUnlimitedToolRounds = false };

        Environment.SetEnvironmentVariable("CHAT_MAX_TOOL_ROUNDS", "17");
        try
        {
            Assert.Equal(17, ChatAgentConfig.ResolveMaxToolRounds(settings));
        }
        finally
        {
            Environment.SetEnvironmentVariable("CHAT_MAX_TOOL_ROUNDS", null);
        }
    }

    [Fact]
    public void ExpandActiveToolsFromResult_pins_search_results()
    {
        var allowed = new HashSet<string>(StringComparer.Ordinal)
        {
            "search_audit_tools",
            "list_broken_links",
            "list_issues",
        };
        var active = new HashSet<string>(StringComparer.Ordinal) { "search_audit_tools" };
        var result = new JsonObject
        {
            ["tool_names"] = new JsonArray("list_broken_links", "list_issues"),
        };

        var expanded = ChatToolSelector.ExpandActiveToolsFromResult(
            "search_audit_tools",
            result,
            active,
            allowed);

        Assert.Contains("list_broken_links", expanded);
        Assert.Contains("list_issues", expanded);
    }

    [Fact]
    public void PhraseToolPins_critical_issues_includes_report_trio()
    {
        var allowed = new HashSet<string>(StringComparer.Ordinal)
        {
            "get_report_summary",
            "get_issue_priority_breakdown",
            "get_critical_issues",
            "list_issues",
            "search_audit_tools",
        };

        var selected = ChatToolSelector.SelectToolsForTurn(
            "show me critical issues on this site",
            priorUserMessages: null,
            allowed);

        Assert.Contains("get_report_summary", selected);
        Assert.Contains("get_issue_priority_breakdown", selected);
        Assert.Contains("get_critical_issues", selected);
    }

    [Fact]
    public void ApplyToolCap_preserves_pinned_playbook_tools()
    {
        var selected = new HashSet<string>(StringComparer.Ordinal);
        foreach (var name in McpToolDomains.Tier0Tools)
        {
            selected.Add(name);
        }

        for (var i = 0; i < 40; i++)
        {
            selected.Add($"synthetic_tool_{i:D2}");
        }

        selected.Add("get_issue_priority_breakdown");
        var pinned = new HashSet<string>(StringComparer.Ordinal) { "get_issue_priority_breakdown" };

        var capped = ChatToolSelector.ApplyToolCap(selected, cap: 25, pinned);

        Assert.Contains("get_issue_priority_breakdown", capped);
    }

    [Fact]
    public void PartialDone_event_serializes_for_sse()
    {
        var json = ChatSseSerializer.ToJson(new ChatPartialDoneStreamEvent("Stopped early"));
        Assert.Equal("partial_done", json["type"]?.GetValue<string>());
        Assert.Equal("Stopped early", json["message"]?.GetValue<string>());
    }

    [Fact]
    public void StripSurrogates_removes_invalid_unicode()
    {
        var cleaned = ChatTextSanitize.StripSurrogates("hi\ud800there");
        Assert.Equal("hithere", cleaned);
    }

    [Fact]
    public void StripSurrogates_preserves_valid_surrogate_pairs()
    {
        // 🚀 (U+1F680) is a valid high+low surrogate pair and must survive.
        const string withEmoji = "rocket 🚀 ok";
        Assert.Equal(withEmoji, ChatTextSanitize.StripSurrogates(withEmoji));
    }

    [Fact]
    public void StripSurrogates_drops_lone_low_surrogate()
    {
        var cleaned = ChatTextSanitize.StripSurrogates("\udc00x");
        Assert.Equal("x", cleaned);
    }
}
