using CoreService.Api.Application.Repositories;

namespace CoreService.Api.Application.Build;

public static class HreflangIssueUrlsBuilder
{
    public static List<Dictionary<string, object?>> Build(IReadOnlyList<CrawlRow> successRows) =>
        CategoryHelpers.HreflangIssues(successRows)
            .Select(i => new Dictionary<string, object?>
            {
                ["url"] = i.Url,
                ["message"] = i.Message,
                ["priority"] = i.Priority,
            })
            .ToList();
}
