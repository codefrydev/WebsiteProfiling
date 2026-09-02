using System.Text.Json.Nodes;
using AiService.Api.Application.Json;

namespace AiService.Tests;

public sealed class JsonNodeCopyTests
{
    [Fact]
    public void JsonArray_is_not_reused_across_two_json_objects()
    {
        var issues = new JsonArray { "missing title tags" };
        var cachePayload = new JsonObject
        {
            ["domain"] = "example.com",
            ["issues"] = JsonNodeCopy.CloneArray(issues),
        };
        var userPayload = new JsonObject
        {
            ["domain"] = "example.com",
            ["issues"] = issues,
        };

        _ = cachePayload.ToJsonString();
        var userJson = userPayload.ToJsonString();

        Assert.Contains("missing title tags", userJson);
    }

    [Fact]
    public void Scalar_fields_are_copied_without_moving_nodes_from_source_object()
    {
        var score = new JsonObject
        {
            ["grade_score"] = 75,
            ["grade_label"] = "B",
        };
        var result = new JsonObject { ["score"] = score };
        var cachePayload = new JsonObject
        {
            ["grade_score"] = score["grade_score"]?.GetValue<int?>() ?? 0,
        };

        Assert.Equal(75, result["score"]?["grade_score"]?.GetValue<int>());
        Assert.Equal(75, cachePayload["grade_score"]?.GetValue<int>());
    }
}
