using AiService.Api.Tools.Registry;

namespace AiService.Tests;

public sealed class ToolCatalogTests
{
    [Fact]
    public void ToolCatalog_loads_369_tools()
    {
        var catalog = new ToolCatalog();
        Assert.Equal(369, catalog.ToolDefinitions.Count);
    }
}
