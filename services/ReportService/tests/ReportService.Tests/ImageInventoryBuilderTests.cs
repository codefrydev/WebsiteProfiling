using ReportService.Application.Build;
using ReportService.Application.Repositories;

namespace ReportService.Tests;

public sealed class ImageInventoryBuilderTests
{
    [Fact]
    public void Build_collects_images_from_page_analysis_and_social_tags()
    {
        var rows = new List<CrawlRow>
        {
            new()
            {
                Url = "https://example.com/page",
                Status = "200",
                PageAnalysisJson = """{"image_urls":["https://example.com/a.jpg","data:image/png;base64,x"]}""",
                OgImage = "https://example.com/og.png",
                TwitterImage = "https://example.com/tw.png",
            },
        };

        var (inventory, summary) = ImageInventoryBuilder.Build(rows);
        Assert.True(summary["inventory_available"] is true);
        Assert.Equal(3, inventory.Count);
        Assert.Contains(inventory, i => i["url"]?.ToString() == "https://example.com/a.jpg");
    }

    [Fact]
    public void NormalizeImageUrl_rejects_data_and_relative_urls()
    {
        Assert.Null(ImageInventoryBuilder.NormalizeImageUrl("data:image/png;base64,abc"));
        Assert.Null(ImageInventoryBuilder.NormalizeImageUrl("/local.png"));
        Assert.Equal("https://example.com/x.png", ImageInventoryBuilder.NormalizeImageUrl("https://example.com/x.png#frag"));
    }
}
