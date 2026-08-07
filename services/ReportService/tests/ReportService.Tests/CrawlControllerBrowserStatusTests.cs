using System.Diagnostics;
using System.Text.Json;
using ReportService.Api.Controllers;

namespace ReportService.Tests;

public sealed class CrawlControllerBrowserStatusTests
{
    [Fact]
    public void ValidateBrowserStatusProbe_returns_error_for_non_zero_exit_code()
    {
        var result = CrawlControllerTestHooks.ValidateBrowserStatusProbe(2, "", "playwright missing");

        var json = System.Text.Json.JsonSerializer.Serialize(result);
        Assert.Contains("\"ok\":false", json);
        Assert.Contains("playwright missing", json);
    }

    [Fact]
    public void ValidateBrowserStatusProbe_returns_error_for_invalid_json_stdout()
    {
        var result = CrawlControllerTestHooks.ValidateBrowserStatusProbe(0, "not-json", "");

        var json = System.Text.Json.JsonSerializer.Serialize(result);
        Assert.Contains("\"ok\":false", json);
        Assert.Contains("invalid JSON", json);
    }

    [Fact]
    public void ValidateBrowserStatusProbe_returns_null_for_valid_json_stdout()
    {
        var result = CrawlControllerTestHooks.ValidateBrowserStatusProbe(0, """{"ok":true}""", "");

        Assert.Null(result);
    }

    [Fact]
    public void TryKillProcessTree_does_not_throw_when_process_already_exited()
    {
        using var proc = Process.Start(new ProcessStartInfo
        {
            FileName = "/bin/echo",
            Arguments = "done",
            RedirectStandardOutput = true,
            UseShellExecute = false,
        });
        Assert.NotNull(proc);
        proc!.WaitForExit(5000);
        Assert.True(proc.HasExited);

        var ex = Record.Exception(() => CrawlControllerTestHooks.TryKillProcessTree(proc));
        Assert.Null(ex);
    }

    internal static class CrawlControllerTestHooks
    {
        public static object? ValidateBrowserStatusProbe(int exitCode, string stdout, string stderr)
        {
            var method = typeof(CrawlController).GetMethod(
                "ValidateBrowserStatusProbe",
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
            Assert.NotNull(method);
            return method!.Invoke(null, [exitCode, stdout, stderr]);
        }

        public static void TryKillProcessTree(Process proc)
        {
            var method = typeof(CrawlController).GetMethod(
                "TryKillProcessTree",
                System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
            Assert.NotNull(method);
            method!.Invoke(null, [proc]);
        }
    }
}
