using System.Globalization;

namespace CoreService.Api.Application.Pipeline;

public static class PipelineStateHelper
{
    /// <summary>Named constants for the pipeline state dictionary keys, so BoolKeys/TristateKeys
    /// and callers elsewhere (e.g. PipelineOrchestratorService.cs) can't drift from each other via typo.</summary>
    public static class Flags
    {
        public const string RunCrawl = "run_crawl";
        public const string RunReport = "run_report";
        public const string RunKeywords = "run_keywords";
        public const string RunLighthouse = "run_lighthouse";
        public const string RunPlot = "run_plot";
        public const string RunSecurity = "run_security";
        public const string RunEnrich = "run_enrich";
        public const string RunGoogle = "run_google";
        public const string RunPageMarkdown = "run_page_markdown";
        public const string IgnoreRobots = "ignore_robots";
        public const string AllowExternal = "allow_external";
        public const string StoreOutlinks = "store_outlinks";
        public const string StoreContentExcerpt = "store_content_excerpt";
        public const string StorePageHtml = "store_page_html";
        public const string RunContentAnalysis = "run_content_analysis";
        public const string ProbeImageInventory = "probe_image_inventory";
        public const string CompareMobileDesktop = "compare_mobile_desktop";
        public const string LighthouseRunMobile = "lighthouse_run_mobile";
        public const string EnableNer = "enable_ner";
        public const string EnableRichResultsValidation = "enable_rich_results_validation";
        public const string NerOnlyTopPages = "ner_only_top_pages";
        public const string EnableHreflangValidation = "enable_hreflang_validation";
        public const string EnableCruxSummary = "enable_crux_summary";
        public const string EnableExecutiveSummary = "enable_executive_summary";
        public const string EnableGoogleKeywordPlanner = "enable_google_keyword_planner";
        public const string EnableCompetitorKeywords = "enable_competitor_keywords";
        public const string ExportCsv = "export_csv";
        public const string ExportJson = "export_json";
        public const string ExportHtml = "export_html";
        public const string ExportPdf = "export_pdf";
        public const string EnableBingBacklinks = "enable_bing_backlinks";
        public const string CrawlRenderModeTristate = "crawl_render_mode_tristate";
    }

    /// <summary>Named constants for the pipeline command dispatch strings in AllowedCommands.</summary>
    public static class Commands
    {
        public const string Crawl = "crawl";
        public const string Report = "report";
        public const string Plot = "plot";
        public const string Lighthouse = "lighthouse";
        public const string Keywords = "keywords";
        public const string KeywordsEnrichGoogle = "keywords --enrich-google";
        public const string Warnings = "warnings";
        public const string Enrich = "enrich";
        public const string Google = "google";
        public const string PageMarkdown = "page-markdown";
    }

    private static readonly HashSet<string> BoolKeys =
    [
        Flags.RunCrawl, Flags.RunReport, Flags.RunKeywords, Flags.RunLighthouse, Flags.RunPlot,
        Flags.RunSecurity, Flags.RunEnrich, Flags.RunGoogle, Flags.RunPageMarkdown,
        Flags.IgnoreRobots, Flags.AllowExternal, Flags.StoreOutlinks, Flags.StoreContentExcerpt,
        Flags.StorePageHtml, Flags.RunContentAnalysis, Flags.ProbeImageInventory,
        Flags.CompareMobileDesktop, Flags.LighthouseRunMobile, Flags.EnableNer,
        Flags.EnableRichResultsValidation, Flags.NerOnlyTopPages,
        Flags.EnableHreflangValidation, Flags.EnableCruxSummary,
        Flags.EnableExecutiveSummary, Flags.EnableGoogleKeywordPlanner,
        Flags.EnableCompetitorKeywords, Flags.ExportCsv, Flags.ExportJson, Flags.ExportHtml,
        Flags.ExportPdf, Flags.EnableBingBacklinks,
    ];

    private static readonly HashSet<string> TristateKeys = [Flags.CrawlRenderModeTristate];

    public static readonly HashSet<string> AllowedCommands =
    [
        "", Commands.Crawl, Commands.Report, Commands.Plot, Commands.Lighthouse, Commands.Keywords,
        Commands.KeywordsEnrichGoogle, Commands.Warnings, Commands.Enrich, Commands.Google, Commands.PageMarkdown,
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
        if (command == Commands.Crawl || command == Commands.Report || command == Commands.Keywords)
        {
            return true;
        }

        if (command is not null and not "")
        {
            return false;
        }

        var runCrawl = ParseBool(state.GetValueOrDefault(Flags.RunCrawl), defaultValue: true);
        var runReport = ParseBool(state.GetValueOrDefault(Flags.RunReport), defaultValue: true);
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
