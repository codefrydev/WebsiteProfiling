using AiService.Application.Handlers;
using AiService.Tools.Modules;
using AiService.Tools.Registry;
using Microsoft.Extensions.DependencyInjection;

namespace AiService.Application;

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
