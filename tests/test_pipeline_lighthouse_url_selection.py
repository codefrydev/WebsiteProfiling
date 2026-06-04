import pandas as pd


def test_select_lighthouse_urls_from_crawl_empty_df_is_safe() -> None:
    from website_profiling.commands.pipeline_cmd import select_lighthouse_urls_from_crawl

    assert select_lighthouse_urls_from_crawl(pd.DataFrame(), max_pages=10) == []


def test_select_lighthouse_urls_from_crawl_requires_url_column() -> None:
    from website_profiling.commands.pipeline_cmd import select_lighthouse_urls_from_crawl

    df = pd.DataFrame([{"status": "200"}])
    assert select_lighthouse_urls_from_crawl(df, max_pages=10) == []


def test_select_lighthouse_urls_from_crawl_filters_to_2xx_and_dedupes() -> None:
    from website_profiling.commands.pipeline_cmd import select_lighthouse_urls_from_crawl

    df = pd.DataFrame(
        [
            {"url": "https://a.com", "status": 200},
            {"url": "https://a.com", "status": "200"},
            {"url": "https://b.com", "status": 204},
            {"url": "https://c.com", "status": 404},
            {"url": None, "status": 200},
            {"url": "  https://d.com  ", "status": 201},
        ]
    )
    assert select_lighthouse_urls_from_crawl(df, max_pages=3) == [
        "https://a.com",
        "https://b.com",
        "https://d.com",
    ]

