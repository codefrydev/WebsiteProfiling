using System.Text.Json.Nodes;
using AiService.Application.Services;

namespace AiService.Tests;

public sealed class OllamaCatalogServiceTests
{
    [Fact]
    public void Billing_fields_can_be_applied_to_many_models_without_json_parent_error()
    {
        for (var i = 0; i < 10; i++)
        {
            var tier = OllamaCatalogService.ResolveBillingTier("gemma3:4b-cloud", "cloud");
            var entry = new JsonObject { ["name"] = "gemma3:4b-cloud" };
            entry["billing"] = tier["billing"]?.GetValue<string>();
            entry["requires_subscription"] = tier["requires_subscription"]?.GetValue<bool>() ?? false;
            Assert.Equal("cloud_free", entry["billing"]?.GetValue<string>());
        }
    }
}
