using System.Text.Json.Nodes;

namespace AiService.Api.Domain.Models;

public sealed class DashboardAiGenerateResponse
{
    public bool Ok { get; init; }

    public string? Error { get; init; }

    public bool Missing { get; init; }

    public JsonObject? Data { get; init; }

    public static DashboardAiGenerateResponse Failure(string error, bool missing = false)
        => new() { Ok = false, Error = error, Missing = missing };

    public static DashboardAiGenerateResponse Success(JsonObject data)
        => new() { Ok = true, Data = data };
}
