using ReportService.Application.Pipeline;

namespace ReportService.Tests;

public sealed class PipelineStateHelperTests
{
    [Fact]
    public void CoercePipelineState_ConvertsBoolKeys()
    {
        var raw = new Dictionary<string, object?>
        {
            ["run_crawl"] = "true",
            ["run_report"] = false,
            ["start_url"] = "https://example.com",
        };

        var state = PipelineStateHelper.CoercePipelineState(raw);

        Assert.Equal("true", state["run_crawl"]);
        Assert.Equal("false", state["run_report"]);
        Assert.Equal("https://example.com", state["start_url"]);
    }

    [Fact]
    public void ValidatePipelineRun_RequiresStartUrlForCrawl()
    {
        var state = new Dictionary<string, string> { ["run_crawl"] = "true" };
        var errors = PipelineStateHelper.ValidatePipelineRun(state, "crawl");
        Assert.Contains(errors, e => e.Contains("Site URL is required", StringComparison.Ordinal));
    }

    [Fact]
    public void CommandBase_ReturnsFirstToken()
    {
        Assert.Equal("crawl", PipelineStateHelper.CommandBase("crawl --resume-run-id 5"));
        Assert.Null(PipelineStateHelper.CommandBase(null));
    }
}
