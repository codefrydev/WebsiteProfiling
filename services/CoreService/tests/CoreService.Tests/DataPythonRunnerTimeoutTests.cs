using CoreService.Api.DataApplication.Python;

namespace CoreService.Tests;

public sealed class DataPythonRunnerTimeoutTests
{
    [Fact]
    public async Task RunScriptAsync_times_out_and_marks_result()
    {
        Environment.SetEnvironmentVariable("DATA_PYTHON_TIMEOUT_SECONDS", "1");
        try
        {
            var runner = new DataPythonRunner();
            var script = "import time; time.sleep(5)";
            var result = await InvokeRunScriptAsync(runner, script, [], null, CancellationToken.None);

            Assert.True(result.TimedOut);
            Assert.Equal(-1, result.ExitCode);
        }
        finally
        {
            Environment.SetEnvironmentVariable("DATA_PYTHON_TIMEOUT_SECONDS", null);
        }
    }

    private static async Task<PythonRunResultReflection> InvokeRunScriptAsync(
        DataPythonRunner runner,
        string script,
        IReadOnlyList<string> args,
        string? stdin,
        CancellationToken cancellationToken)
    {
        var method = typeof(DataPythonRunner).GetMethod(
            "RunScriptAsync",
            System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic,
            binder: null,
            [typeof(string), typeof(IReadOnlyList<string>), typeof(string), typeof(CancellationToken)],
            modifiers: null);
        Assert.NotNull(method);

        var task = (Task)method!.Invoke(runner, [script, args, stdin, cancellationToken])!;
        await task;
        var resultProperty = task.GetType().GetProperty("Result");
        var result = resultProperty!.GetValue(task);
        Assert.NotNull(result);

        var timedOut = (bool)result!.GetType().GetProperty("TimedOut")!.GetValue(result)!;
        var exitCode = (int)result.GetType().GetProperty("ExitCode")!.GetValue(result)!;
        return new PythonRunResultReflection(exitCode, timedOut);
    }

    private sealed record PythonRunResultReflection(int ExitCode, bool TimedOut);
}
