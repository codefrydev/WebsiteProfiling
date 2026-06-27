namespace ReportService.Application.Options;

public sealed class DatabaseOptions
{
    public const string SectionName = "Database";

    public string ConnectionString { get; set; } = "";

    public int MinPoolSize { get; set; } = 2;

    public int MaxPoolSize { get; set; } = 20;

    public int CommandTimeoutSeconds { get; set; } = 30;
}
