using CoreService.Api.Application.Build;

namespace CoreService.Tests;

public sealed class SiteFileParserTests
{
    [Fact]
    public void ParseAdsTxt_valid_and_invalid_lines()
    {
        var text = "example.com, pub-123, DIRECT\n# comment\n\nbad-line";
        var outDict = SiteFileParser.ParseAdsTxt(text);

        Assert.True(outDict["ads_txt_present"] is true);
        Assert.Equal(1, outDict["ads_txt_line_count"]);
        Assert.False(outDict["ads_txt_valid"] is true);
        var issues = Assert.IsType<List<string>>(outDict["ads_txt_issues"]);
        Assert.Contains("invalid_line:4", issues);
    }

    [Fact]
    public void ParseAdsTxt_empty()
    {
        var outDict = SiteFileParser.ParseAdsTxt("");
        Assert.False(outDict["ads_txt_present"] is true);
        Assert.False(outDict["ads_txt_valid"] is true);
    }

    [Fact]
    public void ParseSecurityTxt_contact_and_expires()
    {
        var text = "Contact: mailto:sec@example.com\nExpires: 2030-01-01T00:00:00Z\n";
        var outDict = SiteFileParser.ParseSecurityTxt(text);

        Assert.True(outDict["security_txt_present"] is true);
        Assert.True(outDict["security_txt_valid"] is true);
        var contacts = Assert.IsType<List<string>>(outDict["security_txt_contact"]);
        Assert.Equal("mailto:sec@example.com", contacts[0]);
        Assert.Equal("2030-01-01T00:00:00Z", outDict["security_txt_expires"]);
    }
}
