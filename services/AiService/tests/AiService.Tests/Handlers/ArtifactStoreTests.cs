using System.Text.Json.Nodes;
using AiService.Tools.Artifacts;

namespace AiService.Tests.Handlers;

/// <summary>Ports Python <c>tools/export_artifacts.py</c>.</summary>
[Collection("DATA_DIR env var")]
public sealed class ArtifactStoreTests : IDisposable
{
    private readonly string _previousDataDir;
    private readonly string _tempDir;

    public ArtifactStoreTests()
    {
        _previousDataDir = Environment.GetEnvironmentVariable("DATA_DIR") ?? "";
        _tempDir = Path.Combine(Path.GetTempPath(), "artifact-store-tests-" + Guid.NewGuid());
        Directory.CreateDirectory(_tempDir);
        Environment.SetEnvironmentVariable("DATA_DIR", _tempDir);
    }

    public void Dispose()
    {
        Environment.SetEnvironmentVariable("DATA_DIR", _previousDataDir.Length == 0 ? null : _previousDataDir);
        try
        {
            Directory.Delete(_tempDir, recursive: true);
        }
        catch (IOException)
        {
        }
    }

    [Fact]
    public void SaveArtifact_then_ReadArtifactBytes_round_trips()
    {
        var envelope = ArtifactStore.SaveArtifact("hello,world", "test.csv", "text/csv; charset=utf-8");
        var artifactId = envelope["artifact_id"]!.GetValue<string>();

        var found = ArtifactStore.ReadArtifactBytes(artifactId);

        Assert.NotNull(found);
        Assert.Equal("hello,world", System.Text.Encoding.UTF8.GetString(found!.Value.Bytes));
        Assert.Equal("test.csv", found.Value.Meta["filename"]!.GetValue<string>());
        Assert.Equal($"/api/chat/artifacts/{artifactId}", envelope["download_path"]!.GetValue<string>());
    }

    [Fact]
    public void SaveArtifact_inlines_small_text_content()
    {
        var envelope = ArtifactStore.SaveArtifact("small text", "note.txt", "text/plain");

        Assert.Equal("small text", envelope["content"]!.GetValue<string>());
    }

    [Fact]
    public void SaveArtifact_does_not_inline_binary_content()
    {
        var envelope = ArtifactStore.SaveArtifact([1, 2, 3, 4], "file.pdf", "application/pdf");

        Assert.False(envelope.ContainsKey("content"));
    }

    [Fact]
    public void ReadArtifactBytes_returns_null_for_unknown_id()
    {
        Assert.Null(ArtifactStore.ReadArtifactBytes(Guid.NewGuid().ToString()));
    }

    [Fact]
    public void ReadArtifactBytes_returns_null_for_malformed_id()
    {
        Assert.Null(ArtifactStore.ReadArtifactBytes("not-a-valid-id"));
    }

    [Fact]
    public void DeleteArtifact_removes_meta_and_data_files()
    {
        var envelope = ArtifactStore.SaveArtifact("data", "f.txt", "text/plain");
        var artifactId = envelope["artifact_id"]!.GetValue<string>();

        ArtifactStore.DeleteArtifact(artifactId);

        Assert.Null(ArtifactStore.ReadArtifactBytes(artifactId));
    }

    [Fact]
    public void RowsFromToolResult_extracts_first_matching_list_key()
    {
        var result = new JsonObject
        {
            ["pages"] = new JsonArray(
                new JsonObject { ["url"] = "https://a" },
                new JsonObject { ["url"] = "https://b" }),
        };

        var rows = ArtifactStore.RowsFromToolResult(result);

        Assert.Equal(2, rows.Count);
        Assert.Equal("https://a", rows[0]["url"]!.GetValue<string>());
    }

    [Fact]
    public void RowsFromToolResult_returns_empty_when_result_has_error()
    {
        var result = new JsonObject { ["error"] = "boom", ["pages"] = new JsonArray(new JsonObject()) };

        Assert.Empty(ArtifactStore.RowsFromToolResult(result));
    }

    [Fact]
    public void DictsToCsv_writes_header_and_escapes_commas()
    {
        var rows = new List<JsonObject>
        {
            new() { ["url"] = "https://a", ["title"] = "Hello, World" },
        };

        var csv = ArtifactStore.DictsToCsv(rows);

        Assert.Equal("url,title\r\nhttps://a,\"Hello, World\"\r\n", csv);
    }

    [Fact]
    public void DictsToCsv_returns_empty_string_for_no_rows()
    {
        Assert.Equal("", ArtifactStore.DictsToCsv([]));
    }
}
