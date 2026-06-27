namespace AiService.Tools.Registry;

/// <summary>Maps tool names to C# handlers registered at startup.</summary>
public sealed class ToolRegistry
{
    private readonly Dictionary<string, IToolHandler> _handlers = new(StringComparer.Ordinal);

    public void Register(IToolHandler handler)
    {
        ArgumentNullException.ThrowIfNull(handler);
        _handlers[handler.ToolName] = handler;
    }

    public void RegisterRange(IEnumerable<IToolHandler> handlers)
    {
        foreach (var handler in handlers)
        {
            Register(handler);
        }
    }

    public IToolHandler GetRequired(string toolName)
    {
        if (_handlers.TryGetValue(toolName, out var handler))
        {
            return handler;
        }

        throw new KeyNotFoundException($"Unknown audit tool: {toolName}");
    }

    public bool TryGet(string toolName, out IToolHandler? handler)
        => _handlers.TryGetValue(toolName, out handler);

    public bool TryGetHandler(string toolName, out IToolHandler? handler)
        => TryGet(toolName, out handler);

    public IReadOnlyCollection<string> RegisteredToolNames => _handlers.Keys;
}
