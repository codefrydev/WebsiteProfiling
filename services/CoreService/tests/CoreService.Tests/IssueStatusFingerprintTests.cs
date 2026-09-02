using CoreService.Api.DataApplication.Issues;

namespace CoreService.Tests;

public class IssueStatusFingerprintTests
{
    [Fact]
    public void Compute_matches_python_issue_fingerprint()
    {
        var fp = IssueStatusFingerprint.Compute("msg", "https://ex.com", "cat");
        Assert.Equal(32, fp.Length);
        Assert.Equal("cf71098dd43ba87a28c89112c2dd3a43", fp);
    }

    [Fact]
    public void Compute_treats_null_category_as_empty()
    {
        var fp = IssueStatusFingerprint.Compute("msg", "https://ex.com", null);
        var expected = IssueStatusFingerprint.Compute("msg", "https://ex.com", "");
        Assert.Equal(expected, fp);
    }
}
