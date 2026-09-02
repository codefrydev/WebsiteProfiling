using AiService.Api.Application.Handlers;
using AiService.Api.Tools.Modules;
using AiService.Api.Tools.Registry;

namespace AiService.Api.Application;

public static class ToolRegistryExtensions
{
    public static ToolRegistry CreateToolRegistry(IServiceProvider serviceProvider)
    {
        var registry = new ToolRegistry();
        registry.RegisterRange(ToolHandlerModules.AllHandlers(serviceProvider));
        registry.RegisterRange(LlmToolHandlers.AllHandlers(serviceProvider));
        registry.Register(new DelegatingToolHandler(
            "prioritize_fix_roadmap",
            LlmToolHandlers.PrioritizeFixRoadmapAsync));
        return registry;
    }
}
