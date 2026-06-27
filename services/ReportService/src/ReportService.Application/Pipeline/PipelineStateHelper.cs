using System.Globalization;

namespace ReportService.Application.Pipeline;

public static class PipelineStateHelper
{
    private static readonly HashSet<string> BoolKeys =
    [
        "run_crawl", "run_report", "run_keywords", "run_lighthouse", "run_plot",
        "run_security", "run_enrich", "run_google", "run_page_markdown",
        "ignore_robots", "allow_external", "store_outlinks", "store_content_excerpt",
        "store_page_html", "run_content_analysis", "probe_image_inventory",
        "compare_mobile_desktop", "lighthouse_run_mobile", "enable_ner",
        "enable_rich_results_validation", "ner_only_top_pages",
        "enable_hreflang_validation", "enable_crux_summary",
        "enable_executive_summary", "enable_google_keyword_planner",
        "enable_competitor_keywords", "export_csv", "export_json", "export_html",
        "export_pdf", "enable_bing_backlinks",
    ];

    private static readonly HashSet<string> TristateKeys = ["crawl_render_mode_tristate"];

    public static readonly HashSet<string> AllowedCommands =
    [
        "", "crawl", "report", "plot", "lighthouse", "keywords",
        "keywords --enrich-google", "warnings", "enrich", "google", "page-markdown",
    ];

    public static Dictionary<string, string> CoercePipelineState(IReadOnlyDictionary<string, object?> raw)
    {
        var outState = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var (key, val) in raw)
        {
            if (key.StartsWith("llm_", StringComparison.Ordinal))
            {
                continue;
            }

            if (BoolKeys.Contains(key))
            {
                outState[key] = val is true || string.Equals(val?.ToString(), "true", StringComparison.OrdinalIgnoreCase)
                    ? "true"
                    : "false";
            }
            else if (TristateKeys.Contains(key))
            {
                var s = (val?.ToString() ?? "auto").Trim().ToLowerInvariant();
                outState[key] = s switch
                {
                    "true" => "true",
                    "false" => "false",
                    _ => "auto",
                };
            }
            else
            {
                outState[key] = val is null ? "" : Convert.ToString(val, CultureInfo.InvariantCulture) ?? "";
            }
        }

        return outState;
    }

    public static IReadOnlyList<string> ValidatePipelineRun(IReadOnlyDictionary<string, string> state, string? command)
    {
        var errors = new List<string>();
        var startUrl = state.GetValueOrDefault("start_url")?.Trim() ?? "";

        if (NeedsStartUrl(command, state) && string.IsNullOrEmpty(startUrl))
        {
            errors.Add("Site URL is required. Enter it in Audit settings before continuing.");
        }

        return errors;
    }

    private static bool NeedsStartUrl(string? command, IReadOnlyDictionary<string, string> state)
    {
        if (command == "crawl" || command == "report" || command == "keywords")
        {
            return true;
        }

        if (command is not null and not "")
        {
            return false;
        }

        var runCrawl = ParseBool(state.GetValueOrDefault("run_crawl"), defaultValue: true);
        var runReport = ParseBool(state.GetValueOrDefault("run_report"), defaultValue: true);
        return runCrawl || runReport;
    }

    private static bool ParseBool(string? value, bool defaultValue)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return defaultValue;
        }

        return string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) || value == "1";
    }

    public static string? CommandBase(string? command)
    {
        if (string.IsNullOrWhiteSpace(command))
        {
            return null;
        }

        return command.Split(' ', 2, StringSplitOptions.RemoveEmptyEntries)[0];
    }
}
