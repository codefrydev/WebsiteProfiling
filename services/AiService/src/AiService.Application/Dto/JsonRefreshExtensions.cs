using System.Text.Json.Nodes;

namespace AiService.Application.Dto;

public static class JsonRefreshExtensions
{
    public static bool GetRefresh(this JsonObject body)
        => body["refresh"]?.GetValue<bool?>() == true;
}
