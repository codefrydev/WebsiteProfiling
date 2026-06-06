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


def test_select_lighthouse_urls_from_gsc_ranks_by_clicks() -> None:
    from website_profiling.commands.pipeline_cmd import select_lighthouse_urls_from_gsc

    google = {
        "gsc": {
            "pages": [
                {"page": "https://a.com/low", "clicks": 1},
                {"page": "https://a.com/high", "clicks": 50},
                {"page": "https://a.com/missing", "clicks": 99},
            ]
        }
    }
    crawl = ["https://a.com/low", "https://a.com/high"]
    picked = select_lighthouse_urls_from_gsc(google, crawl, max_pages=2)
    assert picked[0] == "https://a.com/high"
    assert len(picked) == 2


def test_select_lighthouse_urls_from_gsc_falls_back_to_crawl() -> None:
    from website_profiling.commands.pipeline_cmd import select_lighthouse_urls_from_gsc

    google = {"gsc": {"pages": [{"page": "https://other.com", "clicks": 99}]}}
    assert select_lighthouse_urls_from_gsc(google, ["https://a.com/a", "https://a.com/b"], 1) == [
        "https://a.com/a",
    ]


def test_select_lighthouse_urls_from_gsc_skips_bad_rows() -> None:
    from website_profiling.commands.pipeline_cmd import select_lighthouse_urls_from_gsc

    google = {
        "gsc": {
            "pages": [
                "bad-row",
                {"page": "", "clicks": 5},
                {"page": "https://a.com/x", "clicks": "not-a-number"},
            ]
        }
    }
    assert select_lighthouse_urls_from_gsc(google, ["https://a.com/x"], 1) == ["https://a.com/x"]

