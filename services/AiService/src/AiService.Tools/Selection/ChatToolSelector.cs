using System.Text.RegularExpressions;
using AiService.Tools.Domain;
using AiService.Tools.Registry;

namespace AiService.Tools.Selection;

/// <summary>
/// Dynamic per-turn tool selection for chat (ports Python <c>tool_selector.py</c>).
/// </summary>
public static class ChatToolSelector
{
    private static readonly Dictionary<string, string[]> DomainKeywords = new(StringComparer.Ordinal)
    {
        ["issues"] = ["issue", "issues", "critical issues", "fix", "priority", "roadmap", "impact"],
        ["crawl"] = ["crawl", "404", "500", "redirect", "status code", "orphan", "soft 404", "robots"],
        ["onpage"] = ["title tag", "meta description", "h1", "canonical", "noindex", "on-page", "onpage"],
        ["google"] = ["gsc", "search console", "ga4", "analytics", "clicks", "impressions", "queries"],
        ["insight"] = ["opportunity", "engagement", "landing page", "blended", "traffic health", "diagnosis"],
        ["keywords"] = ["keyword", "striking", "cannibal", "brand", "intent"],
        ["performance"] = ["lighthouse", "cwv", "core web vitals", "slow page", "crux", "page speed"],
        ["links"] = ["broken link", "internal link", "inlink", "outlink", "anchor text", "pagerank"],
        ["backlinks"] = ["backlink", "referring domain", "gsc links", "moz", "majestic"],
        ["drift"] = ["compare", "baseline", "delta", "history", "trend", "drift"],
        ["export"] = ["export", "pdf", "csv", "download"],
        ["images"] = ["image", "alt text", "lazy load", "webp", "lcp image"],
        ["geo"] =
        [
            "geo", "aeo", "llms.txt", "faq schema", "eeat", "agentic", "agents.md", "token budget",
            "copy for ai", "agent readiness", "skill.md", "agent permissions", "markdown availability",
        ],
        ["accessibility"] = ["axe", "accessibility", "a11y", "mixed content"],
        ["security"] = ["security", "tls", "hsts", "ssl"],
        ["indexation"] = ["indexation", "sitemap", "hreflang", "indexed"],
        ["content"] = ["duplicate content", "thin content", "word count", "readability"],
        ["ops"] = ["access log", "log analysis", "log upload", "crawl run", "integration status", "5xx", "googlebot"],
        ["portfolio"] = ["overview", "health score", "category scores", "executive", "portfolio", "audit summary"],
        ["ctr"] = ["ctr", "snippet", "title meta ctr"],
    };

    private static readonly Dictionary<string, string[]> PlaybookAnchors = new(StringComparer.Ordinal)
    {
        ["images"] = ["get_image_audit_summary"],
        ["export"] = ["export_audit_report", "export_list_as_csv"],
        ["issues"] = ["get_critical_issues", "get_issue_priority_breakdown", "list_issues"],
        ["portfolio"] = ["get_category_scores", "list_audit_categories"],
        ["performance"] = ["get_lighthouse_summary", "list_pages_slow_response", "list_lighthouse_failure_lcp"],
        ["drift"] = ["compare_reports", "compare_issue_deltas", "list_compare_traffic_losers"],
        ["google"] = ["get_gsc_top_queries", "get_ga4_page_metrics", "list_gsc_decaying_queries", "list_gsc_decaying_pages"],
        ["keywords"] = ["get_striking_distance_keywords", "get_keyword_cannibalisation", "list_keyword_rank_declines"],
        ["indexation"] = ["list_hreflang_issue_pages", "list_indexation_gaps"],
        ["backlinks"] = ["list_referring_domains", "list_backlinks_by_anchor_text"],
        ["ops"] = ["list_log_paths_by_hits", "list_log_5xx_paths"],
    };

    private static readonly Dictionary<string, string[]> PhraseToolPins = new(StringComparer.OrdinalIgnoreCase)
    {
        ["critical issues"] = ["get_report_summary", "get_issue_priority_breakdown", "get_critical_issues"],
        ["top issues"] = ["get_report_summary", "get_issue_priority_breakdown", "get_critical_issues"],
        ["site health"] = ["get_report_summary", "get_category_scores", "list_audit_categories"],
        ["audit overview"] = ["get_report_summary", "get_category_scores", "list_audit_categories"],
        ["broken links"] = ["list_broken_links", "list_internal_broken_links", "list_external_broken_links"],
        ["export pdf"] = ["export_audit_report"],
        ["gsc"] = ["get_gsc_top_queries", "get_google_summary", "get_gsc_daily_trend"],
        ["core web vitals"] = ["get_lighthouse_summary", "list_pages_slow_response"],
    };

    public static string ResolveChatToolMode()
    {
        var env = Environment.GetEnvironmentVariable("CHAT_TOOL_MODE");
        if (!string.IsNullOrWhiteSpace(env))
        {
            return env.Trim().ToLowerInvariant();
        }

        return "dynamic";
    }

    public static int ResolveChatToolMax()
    {
        var floor = McpToolDomains.Tier0Tools.Count + 1;
        var raw = Environment.GetEnvironmentVariable("CHAT_TOOL_MAX");
        if (int.TryParse(raw, out var parsed))
        {
            return Math.Clamp(parsed, floor, 120);
        }

        return Math.Max(floor, 45);
    }

    public static int ResolveChatToolSearchCap()
        => Math.Min(ResolveChatToolMax() + 15, 75);

    public static HashSet<string> SelectToolsForTurn(
        string userMessage,
        IReadOnlyList<string>? priorUserMessages,
        IReadOnlySet<string> allowedTools,
        int? maxTools = null,
        IReadOnlySet<string>? extraNames = null)
    {
        if (ResolveChatToolMode() == "full")
        {
            return allowedTools.ToHashSet(StringComparer.Ordinal);
        }

        var cap = maxTools ?? ResolveChatToolMax();
        var selected = new HashSet<string>(StringComparer.Ordinal);
        var pinned = new HashSet<string>(StringComparer.Ordinal);
        foreach (var name in McpToolDomains.Tier0Tools)
        {
            if (allowedTools.Contains(name))
            {
                selected.Add(name);
            }
        }

        if (extraNames is not null)
        {
            foreach (var name in extraNames)
            {
                if (allowedTools.Contains(name))
                {
                    selected.Add(name);
                }
            }
        }

        var texts = new List<string> { userMessage ?? "" };
        if (priorUserMessages is not null)
        {
            for (var i = priorUserMessages.Count - 1; i >= 0; i--)
            {
                var prior = priorUserMessages[i];
                if (!string.IsNullOrEmpty(prior) && prior != userMessage)
                {
                    texts.Add(prior);
                    break;
                }
            }
        }

        var combined = string.Join(' ', texts);
        var domainScores = ScoreDomains(combined);
        var toolsByDomain = AuditToolSelectionService.GroupToolsByDomain(allowedTools);

        if (domainScores.Count == 0)
        {
            foreach (var fallback in new[] { McpToolDomains.Names.Portfolio, McpToolDomains.Names.Issues, McpToolDomains.Names.Insight })
            {
                AddDomainTools(selected, toolsByDomain, fallback);
            }
        }
        else
        {
            foreach (var domain in domainScores.Take(4).Select(x => x.Domain))
            {
                AddDomainTools(selected, toolsByDomain, domain);
                if (PlaybookAnchors.TryGetValue(domain, out var anchors))
                {
                    foreach (var anchor in anchors)
                    {
                        if (allowedTools.Contains(anchor))
                        {
                            selected.Add(anchor);
                            pinned.Add(anchor);
                        }
                    }
                }
            }
        }

        ApplyPhraseToolPins(selected, combined, allowedTools, pinned);

        selected = ApplyToolCap(selected, cap, pinned);
        selected.IntersectWith(allowedTools);

        if (ChatSqlToolEnabled())
        {
            if (allowedTools.Contains("get_sql_schema"))
            {
                selected.Add("get_sql_schema");
            }

            if (allowedTools.Contains("run_sql_query"))
            {
                selected.Add("run_sql_query");
            }
        }

        return selected;
    }

    public static bool ChatSqlToolEnabled()
        => IsTruthy(Environment.GetEnvironmentVariable("CHAT_SQL_TOOL_ENABLED"));

    /// <summary>
    /// Expand the active tool set after search/domain-agent results (ports Python
    /// <c>_expand_active_tools_from_result</c>).
    /// </summary>
    public static HashSet<string> ExpandActiveToolsFromResult(
        string toolName,
        System.Text.Json.Nodes.JsonObject toolResult,
        HashSet<string> active,
        IReadOnlySet<string> allowedTools)
    {
        var expanded = new HashSet<string>(active, StringComparer.Ordinal);
        var pinned = new HashSet<string>(StringComparer.Ordinal);

        if (toolName == "search_audit_tools" && toolResult["tool_names"] is System.Text.Json.Nodes.JsonArray names)
        {
            var count = 0;
            foreach (var nameNode in names)
            {
                if (count >= 12)
                {
                    break;
                }

                var name = nameNode?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(name) || !allowedTools.Contains(name))
                {
                    continue;
                }

                expanded.Add(name);
                pinned.Add(name);
                count++;
            }
        }
        else if (toolName == "run_domain_agent" && toolResult["tools_used"] is System.Text.Json.Nodes.JsonArray used)
        {
            foreach (var nameNode in used)
            {
                var name = nameNode?.GetValue<string>();
                if (string.IsNullOrWhiteSpace(name) || !allowedTools.Contains(name))
                {
                    continue;
                }

                expanded.Add(name);
                pinned.Add(name);
            }
        }

        if (ResolveChatToolMode() != "full" && pinned.Count > 0)
        {
            return ApplyToolCap(expanded, ResolveChatToolSearchCap(), pinned);
        }

        return expanded;
    }

    public static HashSet<string> ApplyToolCap(
        HashSet<string> selected,
        int cap,
        IReadOnlySet<string>? pinned = null,
        int maxPinned = 12)
    {
        pinned ??= new HashSet<string>(StringComparer.Ordinal);
        var tier0 = selected.Where(McpToolDomains.Tier0Tools.Contains).ToHashSet(StringComparer.Ordinal);
        var pinnedKeep = pinned.Intersect(selected).Order(StringComparer.Ordinal).Take(Math.Max(0, maxPinned)).ToHashSet(StringComparer.Ordinal);
        var mustKeep = tier0.Union(pinnedKeep).ToHashSet(StringComparer.Ordinal);
        if (selected.Count <= cap)
        {
            return selected;
        }

        var rest = selected.Except(mustKeep).Order(StringComparer.Ordinal).Take(Math.Max(0, cap - mustKeep.Count));
        return mustKeep.Union(rest).ToHashSet(StringComparer.Ordinal);
    }

    private static void AddDomainTools(
        HashSet<string> selected,
        IReadOnlyDictionary<string, IReadOnlyList<string>> toolsByDomain,
        string domain)
    {
        if (toolsByDomain.TryGetValue(domain, out var names))
        {
            foreach (var name in names)
            {
                selected.Add(name);
            }
        }
    }

    private static void ApplyPhraseToolPins(
        HashSet<string> selected,
        string combinedText,
        IReadOnlySet<string> allowedTools,
        HashSet<string> pinned)
    {
        var lower = combinedText.ToLowerInvariant();
        foreach (var (phrase, tools) in PhraseToolPins)
        {
            if (!lower.Contains(phrase, StringComparison.Ordinal))
            {
                continue;
            }

            foreach (var tool in tools)
            {
                if (allowedTools.Contains(tool))
                {
                    selected.Add(tool);
                    pinned.Add(tool);
                }
            }
        }
    }

    private static List<(int Score, string Domain)> ScoreDomains(string text)
    {
        var lower = text.ToLowerInvariant();
        var scores = new List<(int Score, string Domain)>();
        foreach (var (domain, keywords) in DomainKeywords)
        {
            var score = keywords.Sum(kw => KeywordInText(kw, lower) ? 3 : 0);
            if (score > 0)
            {
                scores.Add((score, domain));
            }
        }

        scores.Sort((a, b) =>
        {
            var cmp = b.Score.CompareTo(a.Score);
            return cmp != 0 ? cmp : string.Compare(a.Domain, b.Domain, StringComparison.Ordinal);
        });

        return scores;
    }

    private static bool KeywordInText(string keyword, string text)
    {
        if (keyword.Contains(' ', StringComparison.Ordinal))
        {
            return text.Contains(keyword, StringComparison.Ordinal);
        }

        return Regex.IsMatch(text, $@"\b{Regex.Escape(keyword)}\b", RegexOptions.IgnoreCase);
    }

    private static bool IsTruthy(string? raw)
        => raw?.Trim().ToLowerInvariant() is "true" or "1" or "yes";
}
