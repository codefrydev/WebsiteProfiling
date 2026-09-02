namespace CoreService.Api.Application.Options;

public sealed class WorkerOptions
{
    public const string SectionName = "Worker";

    public double PollIntervalSeconds { get; set; } = 1.0;

    public int StalePendingMinutes { get; set; } = 10;

    public int StaleRunningHours { get; set; } = 1;

    public string PythonExecutable { get; set; } = "python3";

    public string RepoRoot { get; set; } = "";

    public string DataDir { get; set; } = "";

    public bool Enabled { get; set; } = true;

    public bool PostCrawlReportBuild { get; set; } = true;
}
