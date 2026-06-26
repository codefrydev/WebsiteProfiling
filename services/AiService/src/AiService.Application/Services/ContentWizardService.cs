using System.Net.Http.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using AiService.Application.Prompts;
using AiService.Domain.Models;
using AiService.Domain.Repositories;
using AiService.Providers.Chat;

namespace AiService.Application.Services;

public sealed class ContentWizardService(
    ILlmSettingsRepository configRepository,
    StructuredCompletionService completionService)
{
    private const int MaxOptions = 6;
    private const int MaxTitles = 6;
    private const int MaxOutline = 24;

    private static readonly (string Label, string Description)[] FallbackContentTypes =
    [
        ("How-to guide", "Step-by-step instructions that walk the reader through a task."),
        ("Listicle", "A scannable numbered or bulleted list of items, tips, or examples."),
        ("Comparison", "Weighs two or more options against each other to aid a decision."),
        ("Explainer / overview", "Defines the topic and covers the essentials for newcomers."),
        ("FAQ", "Answers the common questions searchers ask about the topic."),
        ("Opinion / editorial", "A point-of-view piece backed by reasoning and examples."),
    ];

    private static readonly (string Label, string Description)[] FallbackTones =
    [
        ("Professional", "Polished and credible, suitable for a business audience."),
        ("Conversational", "Warm and approachable, like talking to a knowledgeable friend."),
        ("Authoritative", "Confident and expert, establishing trust and depth."),
        ("Friendly", "Casual and encouraging, easy for beginners to follow."),
        ("Informative", "Neutral and fact-forward, prioritising clarity over flair."),
        ("Persuasive", "Action-oriented, building toward a clear call to action."),
    ];

    public async Task<JsonObject> RunStepAsync(string step, JsonObject payload, CancellationToken cancellationToken = default)
    {
        return step switch
        {
            "intents" => await SuggestIntentsAsync(payload, cancellationToken),
            "content_types" => await SuggestContentTypesAsync(payload, cancellationToken),
            "tones" => await SuggestTonesAsync(payload, cancellationToken),
            "titles" => await SuggestTitlesAsync(payload, cancellationToken),
            "research" => await ResearchPanelAsync(payload, cancellationToken),
            "outline" => await SuggestOutlineAsync(payload, cancellationToken),
            "draft" => await GenerateDraftAsync(payload, cancellationToken),
            _ => new JsonObject { ["ok"] = false, ["error"] = $"unknown step: {step}" },
        };
    }

    private async Task<(LlmSettings? Settings, JsonObject? Error)> GetSettingsAsync(CancellationToken cancellationToken)
    {
        var settings = await configRepository.LoadAsync(cancellationToken);
        if (!LlmConfigHelpers.IsEnabled(settings) || !settings.EnableContentStudio)
        {
            return (null, new JsonObject { ["ok"] = false, ["error"] = "AI is disabled. Enable it in Run audit → AI settings." });
        }

        return (settings, null);
    }

    private async Task<JsonObject> SuggestIntentsAsync(JsonObject payload, CancellationToken cancellationToken)
    {
        var (settings, err) = await GetSettingsAsync(cancellationToken);
        if (err is not null)
        {
            return err;
        }

        var kw = Clean(payload["keyword"]?.GetValue<string>());
        if (string.IsNullOrEmpty(kw))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "keyword required" };
        }

        var locale = payload["locale"]?.GetValue<string>() ?? "en-US";
        var user =
            $"For the search keyword \"{kw}\" (locale {locale}), list up to {MaxOptions} distinct " +
            "search intents a reader might have. Return JSON: " +
            "{\"intents\":[{\"label\":\"short intent label\",\"description\":\"one sentence\"}]}";

        var data = await SafeCompleteAsync(user, settings!, cancellationToken);
        var options = NormalizeOptions(data["intents"]) ?? FallbackIntents(kw);
        return new JsonObject { ["ok"] = true, ["options"] = options };
    }

    private async Task<JsonObject> SuggestContentTypesAsync(JsonObject payload, CancellationToken cancellationToken)
    {
        var (settings, err) = await GetSettingsAsync(cancellationToken);
        if (err is not null)
        {
            return err;
        }

        var keyword = Clean(payload["keyword"]?.GetValue<string>());
        var intent = Clean(payload["intent"]?.GetValue<string>());
        var user =
            $"A writer is creating content for the keyword \"{keyword}\" with the intent \"{intent}\". " +
            $"Recommend up to {MaxOptions} content types that best serve this, best first. " +
            "Return JSON: {\"content_types\":[{\"label\":\"type\",\"description\":\"why it fits\"}]}";

        var data = await SafeCompleteAsync(user, settings!, cancellationToken);
        var options = NormalizeOptions(data["content_types"]) ?? OptionsFromPairs(FallbackContentTypes);
        return new JsonObject { ["ok"] = true, ["options"] = options };
    }

    private async Task<JsonObject> SuggestTonesAsync(JsonObject payload, CancellationToken cancellationToken)
    {
        var (settings, err) = await GetSettingsAsync(cancellationToken);
        if (err is not null)
        {
            return err;
        }

        var user =
            $"For a \"{Clean(payload["contentType"]?.GetValue<string>())}\" about \"{Clean(payload["keyword"]?.GetValue<string>())}\" " +
            $"(intent: \"{Clean(payload["intent"]?.GetValue<string>())}\"), recommend up to {MaxOptions} writing tones, best first. " +
            "Return JSON: {\"tones\":[{\"label\":\"tone\",\"description\":\"when to use it\"}]}";

        var data = await SafeCompleteAsync(user, settings!, cancellationToken);
        var options = NormalizeOptions(data["tones"]) ?? OptionsFromPairs(FallbackTones);
        return new JsonObject { ["ok"] = true, ["options"] = options };
    }

    private async Task<JsonObject> SuggestTitlesAsync(JsonObject payload, CancellationToken cancellationToken)
    {
        var (settings, err) = await GetSettingsAsync(cancellationToken);
        if (err is not null)
        {
            return err;
        }

        var kw = Clean(payload["keyword"]?.GetValue<string>());
        var user =
            $"Write up to {MaxTitles} compelling, SEO-friendly article titles for the keyword \"{kw}\". " +
            $"Content type: \"{Clean(payload["contentType"]?.GetValue<string>())}\". " +
            $"Intent: \"{Clean(payload["intent"]?.GetValue<string>())}\". " +
            $"Tone: \"{Clean(payload["tone"]?.GetValue<string>())}\". " +
            "Keep each under 60 characters where possible and include the keyword naturally. " +
            "Return JSON: {\"titles\":[\"title one\",\"title two\"]}";

        var data = await SafeCompleteAsync(user, settings!, cancellationToken);
        var titles = NormalizeStringList(data["titles"]) ?? FallbackTitles(kw);
        return new JsonObject { ["ok"] = true, ["titles"] = titles };
    }

    private async Task<JsonObject> ResearchPanelAsync(JsonObject payload, CancellationToken cancellationToken)
    {
        var (settings, err) = await GetSettingsAsync(cancellationToken);
        if (err is not null)
        {
            return err;
        }

        var kw = Clean(payload["keyword"]?.GetValue<string>());
        if (string.IsNullOrEmpty(kw))
        {
            return new JsonObject { ["ok"] = false, ["error"] = "keyword required" };
        }

        var title = Clean(payload["title"]?.GetValue<string>());
        var intent = Clean(payload["intent"]?.GetValue<string>());
        var context = !string.IsNullOrEmpty(title) || !string.IsNullOrEmpty(intent)
            ? $" The article is \"{title}\" (intent \"{intent}\")."
            : "";

        var user =
            $"For the search keyword \"{kw}\", help an author research the topic.{context} Return JSON with: " +
            "\"questions\" = up to 8 \"People Also Ask\" style questions real searchers ask; " +
            "\"sources\" = up to 6 authoritative reference types to cite, each " +
            "{\"label\":\"source name or type\",\"description\":\"what to cite it for\"}. " +
            "Return JSON: {\"questions\":[\"...\"],\"sources\":[{\"label\":\"...\",\"description\":\"...\"}]}";

        var data = await SafeCompleteAsync(user, settings!, cancellationToken);
        var questions = NormalizeStringList(data["questions"]) ?? FallbackQuestions(kw);
        var sources = NormalizeOptions(data["sources"]) ?? FallbackSources();
        return new JsonObject
        {
            ["ok"] = true,
            ["questions"] = questions,
            ["sources"] = sources,
        };
    }

    private async Task<JsonObject> SuggestOutlineAsync(JsonObject payload, CancellationToken cancellationToken)
    {
        var (settings, err) = await GetSettingsAsync(cancellationToken);
        if (err is not null)
        {
            return err;
        }

        var title = Clean(payload["title"]?.GetValue<string>());
        var user =
            $"Create a heading outline for an article titled \"{title}\" " +
            $"(keyword \"{Clean(payload["keyword"]?.GetValue<string>())}\", {Clean(payload["contentType"]?.GetValue<string>())}, " +
            $"intent \"{Clean(payload["intent"]?.GetValue<string>())}\", tone \"{Clean(payload["tone"]?.GetValue<string>())}\"). " +
            "Use h2 for main sections and h3 for sub-points. Do not include the title as a heading. " +
            "Return JSON: {\"outline\":[{\"level\":\"h2\",\"text\":\"Section heading\"},{\"level\":\"h3\",\"text\":\"Sub-point\"}]}";

        var data = await SafeCompleteAsync(user, settings!, cancellationToken);
        var outline = NormalizeOutline(data["outline"], title);
        return new JsonObject { ["ok"] = true, ["outline"] = outline };
    }

    private async Task<JsonObject> GenerateDraftAsync(JsonObject payload, CancellationToken cancellationToken)
    {
        var (settings, err) = await GetSettingsAsync(cancellationToken);
        if (err is not null)
        {
            return err;
        }

        var keyword = Clean(payload["keyword"]?.GetValue<string>());
        var title = Clean(payload["title"]?.GetValue<string>());
        var outlineRaw = payload["outline"] as JsonArray ?? [];
        var normalized = NormalizeOutline(outlineRaw, title);
        var h1Text = normalized.FirstOrDefault(x => x["level"]?.GetValue<string>() == "h1")?["text"]?.GetValue<string>()
            ?? title
            ?? keyword;
        var headings = normalized
            .OfType<JsonObject>()
            .Where(x => x["level"]?.GetValue<string>() != "h1")
            .ToList();
        var headingsText = string.Join('\n', headings.Select(x => $"{x["level"]}: {x["text"]}"));

        var user =
            $"Write the body of a \"{Clean(payload["contentType"]?.GetValue<string>())}\" titled \"{h1Text}\" for the keyword " +
            $"\"{keyword}\" (intent \"{Clean(payload["intent"]?.GetValue<string>())}\", tone \"{Clean(payload["tone"]?.GetValue<string>())}\"). " +
            $"Write 2-4 sentences of plain-text prose for each heading below, in order:\n{headingsText}\n\n" +
            "Return JSON: {\"title_tag\":\"SEO title under 60 chars\",\"meta_description\":\"under 160 chars\"," +
            "\"sections\":[\"prose for heading 1\",\"prose for heading 2\", ...]} " +
            "with one sections entry per heading, in the same order.";

        var data = await SafeCompleteAsync(user, settings!, cancellationToken);
        var titleTag = Clean(data["title_tag"]?.GetValue<string>());
        if (string.IsNullOrEmpty(titleTag))
        {
            titleTag = h1Text;
        }

        titleTag = titleTag[..Math.Min(titleTag.Length, 70)];
        var meta = Clean(data["meta_description"]?.GetValue<string>());
        if (string.IsNullOrEmpty(meta))
        {
            meta = $"{h1Text}. Learn about {keyword}.";
        }

        meta = meta[..Math.Min(meta.Length, 170)];
        var bodyHtml = AssembleBody(h1Text, headings, data["sections"]);

        return new JsonObject
        {
            ["ok"] = true,
            ["title_tag"] = titleTag,
            ["meta_description"] = meta,
            ["body_html"] = bodyHtml,
            ["outline"] = normalized,
        };
    }

    private async Task<JsonObject> SafeCompleteAsync(
        string user,
        LlmSettings settings,
        CancellationToken cancellationToken)
    {
        try
        {
            return await completionService.CompleteJsonAsync(LlmPrompts.ContentWizardJsonSystem, user, settings, cancellationToken);
        }
        catch (Exception)
        {
            return [];
        }
    }

    private static string Clean(string? value)
        => Regex.Replace((value ?? "").Trim(), @"\s+", " ");

    private static JsonArray OptionsFromPairs(IEnumerable<(string Label, string Description)> pairs)
    {
        var arr = new JsonArray();
        foreach (var (label, desc) in pairs)
        {
            arr.Add(new JsonObject { ["label"] = label, ["description"] = desc });
        }

        return arr;
    }

    private static JsonArray? NormalizeOptions(JsonNode? raw)
    {
        if (raw is not JsonArray list)
        {
            return null;
        }

        var outArr = new JsonArray();
        foreach (var item in list)
        {
            string label;
            string desc;
            if (item is JsonObject obj)
            {
                label = Clean(obj["label"]?.GetValue<string>() ?? obj["name"]?.GetValue<string>() ?? obj["title"]?.GetValue<string>());
                desc = Clean(obj["description"]?.GetValue<string>() ?? obj["summary"]?.GetValue<string>());
            }
            else
            {
                label = Clean(item?.GetValue<string>());
                desc = "";
            }

            if (!string.IsNullOrEmpty(label))
            {
                outArr.Add(new JsonObject
                {
                    ["label"] = label[..Math.Min(label.Length, 120)],
                    ["description"] = desc[..Math.Min(desc.Length, 240)],
                });
            }
        }

        return outArr.Count > 0 ? outArr : null;
    }

    private static JsonArray? NormalizeStringList(JsonNode? raw)
    {
        if (raw is not JsonArray list)
        {
            return null;
        }

        var outArr = new JsonArray();
        foreach (var item in list)
        {
            var text = item is JsonObject obj
                ? Clean(obj["text"]?.GetValue<string>() ?? obj["title"]?.GetValue<string>())
                : Clean(item?.GetValue<string>());
            if (!string.IsNullOrEmpty(text))
            {
                outArr.Add(text[..Math.Min(text.Length, 160)]);
            }
        }

        return outArr.Count > 0 ? outArr : null;
    }

    private static JsonArray NormalizeOutline(JsonNode? raw, string title)
    {
        var items = new List<JsonObject>();
        if (raw is JsonArray list)
        {
            foreach (var it in list)
            {
                string level;
                string text;
                if (it is JsonObject obj)
                {
                    level = (obj["level"]?.GetValue<string>() ?? "h2").Trim().ToLowerInvariant();
                    text = Clean(obj["text"]?.GetValue<string>() ?? obj["title"]?.GetValue<string>() ?? obj["heading"]?.GetValue<string>());
                }
                else
                {
                    level = "h2";
                    text = Clean(it?.GetValue<string>());
                }

                if (level is not ("h1" or "h2" or "h3"))
                {
                    level = "h2";
                }

                if (!string.IsNullOrEmpty(text))
                {
                    items.Add(new JsonObject { ["level"] = level, ["text"] = text[..Math.Min(text.Length, 200)] });
                }

                if (items.Count >= MaxOutline)
                {
                    break;
                }
            }
        }

        var titleText = Clean(title);
        if (string.IsNullOrEmpty(titleText))
        {
            titleText = items.FirstOrDefault()?["text"]?.GetValue<string>() ?? "Untitled";
        }

        var bodyItems = items.Where(x => x["level"]?.GetValue<string>() != "h1").ToList();
        if (bodyItems.Count == 0)
        {
            return FallbackOutline(titleText);
        }

        var result = new JsonArray { new JsonObject { ["level"] = "h1", ["text"] = titleText } };
        foreach (var item in bodyItems.Take(MaxOutline - 1))
        {
            result.Add(item.DeepClone());
        }

        return result;
    }

    private static JsonArray FallbackIntents(string keyword)
    {
        var kw = keyword.Trim();
        return OptionsFromPairs([
            ($"Learn about {kw}", $"Understand what {kw} is and why it matters."),
            ($"How to use {kw}", $"Practical, step-by-step guidance for {kw}."),
            ($"Best {kw} options", $"Compare the top {kw} choices available."),
            ($"{kw} reviews & comparisons", $"Evaluate {kw} against the alternatives."),
        ]);
    }

    private static JsonArray FallbackTitles(string keyword)
    {
        var t = string.IsNullOrWhiteSpace(keyword) ? "Your Topic" : keyword.Trim().ToUpperInvariant();
        return new JsonArray
        {
            $"{t}: A Complete Guide",
            $"What Is {t}? Everything You Need to Know",
            $"The Beginner's Guide to {t}",
            $"{t}: Tips, Examples, and Best Practices",
        };
    }

    private static JsonArray FallbackOutline(string title)
    {
        var h1 = string.IsNullOrWhiteSpace(title) ? "Untitled" : title.Trim();
        var sections = new[] { "Introduction", "Key concepts", "How it works", "Practical tips", "Common mistakes", "Conclusion" };
        var arr = new JsonArray { new JsonObject { ["level"] = "h1", ["text"] = h1 } };
        foreach (var section in sections)
        {
            arr.Add(new JsonObject { ["level"] = "h2", ["text"] = section });
        }

        return arr;
    }

    private static JsonArray FallbackQuestions(string keyword)
    {
        var kw = keyword.Trim();
        return new JsonArray
        {
            $"What is {kw}?",
            $"How does {kw} work?",
            $"Why is {kw} important?",
            $"What are examples of {kw}?",
            $"How do you use {kw}?",
        };
    }

    private static JsonArray FallbackSources()
        => OptionsFromPairs([
            ("Wikipedia", "Background, definitions, and a neutral overview."),
            ("Official site or documentation", "Authoritative first-party specifics."),
            ("Industry publications", "Expert analysis, trends, and commentary."),
            ("Academic or research sources", "Evidence for data-backed claims."),
            ("Reputable news coverage", "Recent developments and real-world context."),
        ]);

    private static string AssembleBody(string h1Text, IReadOnlyList<JsonObject> headings, JsonNode? sections)
    {
        var sectionList = sections as JsonArray ?? [];
        var parts = new List<string> { $"<h1>{System.Net.WebUtility.HtmlEncode(h1Text)}</h1>" };
        for (var i = 0; i < headings.Count; i++)
        {
            var heading = headings[i];
            var level = heading["level"]?.GetValue<string>() ?? "h2";
            var text = heading["text"]?.GetValue<string>() ?? "";
            var prose = "";
            if (i < sectionList.Count)
            {
                var raw = sectionList[i];
                prose = raw is JsonObject obj
                    ? Clean(obj["text"]?.GetValue<string>())
                    : Clean(raw?.GetValue<string>());
            }

            if (string.IsNullOrEmpty(prose))
            {
                prose = $"Add details about {text.ToLowerInvariant()} here.";
            }

            parts.Add($"<{level}>{System.Net.WebUtility.HtmlEncode(text)}</{level}>");
            parts.Add($"<p>{System.Net.WebUtility.HtmlEncode(prose)}</p>");
        }

        return string.Join('\n', parts);
    }
}
