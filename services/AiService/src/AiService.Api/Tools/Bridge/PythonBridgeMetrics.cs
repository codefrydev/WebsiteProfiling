namespace AiService.Api.Tools.Bridge;

/// <summary>
/// Tracks Python audit-tool bridge usage. When <see cref="BridgeDispatchCount"/> reaches zero
/// and all catalog tools have native handlers, the FastAPI audit-tool bridge may be removed.
/// </summary>
public static class PythonBridgeMetrics
{
    private static long _bridgeDispatchCount;

    public static long BridgeDispatchCount => Interlocked.Read(ref _bridgeDispatchCount);

    public static void RecordBridgeDispatch() =>
        Interlocked.Increment(ref _bridgeDispatchCount);
}
