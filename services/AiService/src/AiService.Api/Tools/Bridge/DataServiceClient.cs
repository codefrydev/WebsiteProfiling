using WebsiteProfiling.Contracts.Report;

namespace AiService.Api.Tools.Bridge;

/// <summary>
/// HTTP client for the .NET Data service's report export deliverables
/// (<c>{DATA_SERVICE_URL}/v1/reports/{reportId}/{pdf,csv,json}</c>). Backs the chat
/// <c>export_audit_report</c> tool.
/// </summary>
public sealed class DataServiceClient(HttpClient http)
{
    public async Task<byte[]?> GetPdfAsync(long reportId, string profile, CancellationToken cancellationToken)
    {
        var url = $"{ReportExportRoutes.V1ReportsPrefix}/{reportId}/pdf" +
            $"?{ReportExportRoutes.ProfileParam}={Uri.EscapeDataString(profile)}" +
            $"&{ReportExportRoutes.DispositionParam}=attachment" +
            $"&{ReportExportRoutes.BrandingParam}=true";
        using var response = await http.GetAsync(url, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsByteArrayAsync(cancellationToken);
    }

    public Task<string?> GetCsvAsync(long reportId, CancellationToken cancellationToken)
        => GetTextAsync($"{ReportExportRoutes.V1ReportsPrefix}/{reportId}/csv", cancellationToken);

    public Task<string?> GetJsonAsync(long reportId, CancellationToken cancellationToken)
        => GetTextAsync($"{ReportExportRoutes.V1ReportsPrefix}/{reportId}/json", cancellationToken);

    private async Task<string?> GetTextAsync(string url, CancellationToken cancellationToken)
    {
        using var response = await http.GetAsync(url, cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        return await response.Content.ReadAsStringAsync(cancellationToken);
    }
}
