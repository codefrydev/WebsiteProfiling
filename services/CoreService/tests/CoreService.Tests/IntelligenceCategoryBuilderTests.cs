using System.Text.Json;
using CoreService.Api.Application.Build.Categories;

namespace CoreService.Tests;

public sealed class IntelligenceCategoryBuilderTests
{
    [Fact]
    public void Big_duplicate_groups_high_priority()
    {
        var ml = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "content_duplicates": [
                {"member_count": 4, "member_urls": ["a", "b", "c", "d"]},
                {"member_count": 3, "member_urls": ["e", "f", "g"]}
              ]
            }
            """)!;

        var cat = IntelligenceCategoryBuilder.Build(ml);
        Assert.Contains(cat.Issues, i => i.Message.Contains("3+ URLs", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Small_duplicate_groups_medium_priority()
    {
        var ml = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """{"content_duplicates": [{"member_count": 2, "member_urls": ["a", "b"]}]}""")!;

        var cat = IntelligenceCategoryBuilder.Build(ml);
        Assert.Contains(cat.Issues, i => i.Message.Contains("pair/group", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Mixed_language_site()
    {
        var ml = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "language_summary": {
                "mixed_site": true,
                "detected_pages": 12,
                "counts": {"en": 8, "fr": 4}
              }
            }
            """)!;

        var cat = IntelligenceCategoryBuilder.Build(ml);
        Assert.Contains(cat.Issues, i => i.Message.Contains("Mixed languages", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public void Mixed_language_without_counts_uses_multiple_label()
    {
        var ml = JsonSerializer.Deserialize<Dictionary<string, object?>>(
            """
            {
              "language_summary": {
                "mixed_site": true,
                "detected_pages": 10,
                "counts": {}
              }
            }
            """)!;

        var cat = IntelligenceCategoryBuilder.Build(ml);
        Assert.Contains("multiple", cat.Issues[0].Message, StringComparison.OrdinalIgnoreCase);
    }
}
