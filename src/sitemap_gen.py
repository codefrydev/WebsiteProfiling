"""Sitemap generation: XML, image sitemaps, and IndexNow/search engine submission."""
import os
import xml.etree.ElementTree as ET
from datetime import datetime, date
from pathlib import Path
from typing import Optional
from urllib.parse import urljoin, urlparse


def _indent_xml(elem, level=0):
    """Add pretty-print indentation to ElementTree."""
    indent = "\n" + "  " * level
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = indent + "  "
        if not elem.tail or not elem.tail.strip():
            elem.tail = indent
        for child in elem:
            _indent_xml(child, level + 1)
        if not child.tail or not child.tail.strip():
            child.tail = indent
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = indent
    if not level:
        elem.tail = "\n"


class SitemapGenerator:
    """Generate XML sitemaps from crawl data."""

    SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
    IMAGE_NS = "http://www.google.com/schemas/sitemap-image/1.1"

    def generate_from_db(self, db_path: str, base_url: str, output_path: str = "sitemap.xml",
                          changefreq: str = "weekly", priority_map: dict = None) -> str:
        """Generate XML sitemap from DB crawl results."""
        from src.db import get_connection, read_crawl
        conn = get_connection(db_path)
        df = read_crawl(conn)
        conn.close()

        urls = []
        if not df.empty and "url" in df.columns:
            ok_df = df[df.get("status", df.get("status_code", None)).astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
            urls = ok_df["url"].dropna().astype(str).str.strip().unique().tolist()

        return self.generate(urls, base_url, output_path, changefreq, priority_map)

    def generate(self, urls: list, base_url: str, output_path: str = "sitemap.xml",
                  changefreq: str = "weekly", priority_map: dict = None) -> str:
        """Generate XML sitemap from URL list."""
        priority_map = priority_map or {}
        ET.register_namespace("", self.SITEMAP_NS)
        urlset = ET.Element("urlset", xmlns=self.SITEMAP_NS)

        for url in urls:
            if not url.startswith("http"):
                url = urljoin(base_url, url)
            parsed = urlparse(url)
            priority = priority_map.get(parsed.path, "0.5")
            if parsed.path in ("/", ""):
                priority = "1.0"
            elif parsed.path.count("/") == 1:
                priority = "0.8"

            url_el = ET.SubElement(urlset, "url")
            ET.SubElement(url_el, "loc").text = url
            ET.SubElement(url_el, "lastmod").text = date.today().isoformat()
            ET.SubElement(url_el, "changefreq").text = changefreq
            ET.SubElement(url_el, "priority").text = str(priority)

        _indent_xml(urlset)
        tree = ET.ElementTree(urlset)
        ET.indent(tree, space="  ") if hasattr(ET, "indent") else None
        with open(output_path, "wb") as f:
            f.write(b'<?xml version="1.0" encoding="UTF-8"?>\n')
            tree.write(f, encoding="utf-8", xml_declaration=False)
        return output_path

    def generate_image_sitemap(self, db_path: str, base_url: str,
                                output_path: str = "sitemap-images.xml") -> str:
        """Generate image XML sitemap from crawl data."""
        from src.db import get_connection, read_crawl
        conn = get_connection(db_path)
        df = read_crawl(conn)
        conn.close()

        ET.register_namespace("", self.SITEMAP_NS)
        ET.register_namespace("image", self.IMAGE_NS)
        urlset = ET.Element("urlset", {
            "xmlns": self.SITEMAP_NS,
            "xmlns:image": self.IMAGE_NS,
        })

        image_extensions = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"}
        if not df.empty and "url" in df.columns:
            for _, row in df.iterrows():
                url = str(row.get("url", ""))
                parsed = urlparse(url)
                if any(parsed.path.lower().endswith(ext) for ext in image_extensions):
                    url_el = ET.SubElement(urlset, "url")
                    ET.SubElement(url_el, "loc").text = url if url.startswith("http") else urljoin(base_url, url)
                    img_el = ET.SubElement(url_el, f"{{{self.IMAGE_NS}}}image")
                    ET.SubElement(img_el, f"{{{self.IMAGE_NS}}}loc").text = url if url.startswith("http") else urljoin(base_url, url)
                    title = str(row.get("title", "")) or parsed.path.split("/")[-1]
                    if title:
                        ET.SubElement(img_el, f"{{{self.IMAGE_NS}}}title").text = title

        with open(output_path, "wb") as f:
            f.write(b'<?xml version="1.0" encoding="UTF-8"?>\n')
            ET.ElementTree(urlset).write(f, encoding="utf-8", xml_declaration=False)
        return output_path

    def generate_index(self, sitemaps: list, base_url: str, output_path: str = "sitemap-index.xml") -> str:
        """Generate a sitemap index referencing multiple sitemaps."""
        SITEMAP_INDEX_NS = "http://www.sitemaps.org/schemas/sitemap/0.9"
        ET.register_namespace("", SITEMAP_INDEX_NS)
        index = ET.Element("sitemapindex", xmlns=SITEMAP_INDEX_NS)
        for sitemap_path in sitemaps:
            sitemap_url = urljoin(base_url, os.path.basename(sitemap_path))
            sm_el = ET.SubElement(index, "sitemap")
            ET.SubElement(sm_el, "loc").text = sitemap_url
            ET.SubElement(sm_el, "lastmod").text = date.today().isoformat()
        with open(output_path, "wb") as f:
            f.write(b'<?xml version="1.0" encoding="UTF-8"?>\n')
            ET.ElementTree(index).write(f, encoding="utf-8", xml_declaration=False)
        return output_path


class IndexNowSubmitter:
    """Submit URLs to IndexNow (Bing, Yandex, etc.)."""

    INDEXNOW_ENDPOINTS = [
        "https://api.indexnow.org/indexnow",
        "https://www.bing.com/indexnow",
        "https://yandex.com/indexnow",
    ]

    def submit_urls(self, urls: list, host: str, key: str, key_location: str = None) -> list:
        """Submit URLs to IndexNow endpoints."""
        try:
            import httpx
        except ImportError:
            return [{"error": "httpx not installed"}]

        if not key:
            return [{"error": "IndexNow key not configured. Set INDEXNOW_KEY in .env"}]

        results = []
        payload = {
            "host": host,
            "key": key,
            "keyLocation": key_location or f"https://{host}/{key}.txt",
            "urlList": urls[:10000],
        }
        for endpoint in self.INDEXNOW_ENDPOINTS:
            try:
                with httpx.Client(timeout=15) as client:
                    resp = client.post(endpoint, json=payload, headers={"Content-Type": "application/json"})
                results.append({
                    "endpoint": endpoint,
                    "status": "submitted" if resp.status_code in (200, 202) else "error",
                    "http_status": resp.status_code,
                    "urls_submitted": len(payload["urlList"]),
                })
            except Exception as e:
                results.append({"endpoint": endpoint, "status": "error", "reason": str(e)})
        return results

    def generate_key_file(self, key: str, output_dir: str = ".") -> str:
        """Generate the IndexNow key verification file."""
        path = os.path.join(output_dir, f"{key}.txt")
        with open(path, "w") as f:
            f.write(key)
        return path


class SearchEngineSubmitter:
    """Submit sitemaps to Google and Bing Search Console."""

    def submit_to_google(self, sitemap_url: str, credentials_file: str = None) -> dict:
        """Submit sitemap to Google Search Console."""
        try:
            from google.oauth2.service_account import Credentials
            from googleapiclient.discovery import build
        except ImportError:
            return {"error": "google-api-python-client required"}

        creds_file = credentials_file or os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "")
        if not creds_file:
            return {"error": "GOOGLE_SERVICE_ACCOUNT_FILE not configured"}

        try:
            parsed = urlparse(sitemap_url)
            site_url = f"{parsed.scheme}://{parsed.netloc}/"
            creds = Credentials.from_service_account_file(
                creds_file,
                scopes=["https://www.googleapis.com/auth/webmasters"],
            )
            service = build("searchconsole", "v1", credentials=creds)
            service.sitemaps().submit(siteUrl=site_url, feedpath=sitemap_url).execute()
            return {"status": "submitted", "sitemap_url": sitemap_url}
        except Exception as e:
            return {"status": "error", "reason": str(e)}

    def submit_to_bing(self, sitemap_url: str, api_key: str = None) -> dict:
        """Submit sitemap to Bing Webmaster Tools."""
        api_key = api_key or os.getenv("BING_WEBMASTER_API_KEY", "")
        if not api_key:
            return {"error": "BING_WEBMASTER_API_KEY not configured"}
        try:
            import httpx
            parsed = urlparse(sitemap_url)
            site_url = f"{parsed.scheme}://{parsed.netloc}/"
            with httpx.Client(timeout=15) as client:
                resp = client.get(
                    "https://ssl.bing.com/webmaster/api.svc/json/AddSitemap",
                    params={"apikey": api_key, "siteUrl": site_url, "feedUrl": sitemap_url},
                )
            return {"status": "submitted" if resp.status_code == 200 else "error", "http_status": resp.status_code}
        except Exception as e:
            return {"status": "error", "reason": str(e)}


def cmd_generate(db_path: str, base_url: str, output: str = "sitemap.xml", changefreq: str = "weekly"):
    gen = SitemapGenerator()
    print(f"Generating sitemap for {base_url}...")
    path = gen.generate_from_db(db_path, base_url, output, changefreq)
    size = os.path.getsize(path) if os.path.exists(path) else 0
    print(f"  Sitemap: {path} ({size:,} bytes)")


def cmd_generate_images(db_path: str, base_url: str, output: str = "sitemap-images.xml"):
    gen = SitemapGenerator()
    print(f"Generating image sitemap for {base_url}...")
    path = gen.generate_image_sitemap(db_path, base_url, output)
    print(f"  Image sitemap: {path}")


def cmd_indexnow(urls_file: str, host: str):
    key = os.getenv("INDEXNOW_KEY", "")
    if not key:
        print("INDEXNOW_KEY not set in .env")
        return
    with open(urls_file) as f:
        urls = [line.strip() for line in f if line.strip()]
    submitter = IndexNowSubmitter()
    print(f"Submitting {len(urls)} URLs to IndexNow...")
    results = submitter.submit_urls(urls, host, key)
    for r in results:
        status = r.get("status", "?")
        submitted = r.get("urls_submitted", 0)
        print(f"  {r.get('endpoint', '?')}: {status} ({submitted} URLs)")


def cmd_submit_google(sitemap_url: str):
    submitter = SearchEngineSubmitter()
    print(f"Submitting to Google Search Console: {sitemap_url}")
    result = submitter.submit_to_google(sitemap_url)
    print(f"  Status: {result.get('status', result.get('error', '?'))}")


def main(args=None):
    import argparse
    from dotenv import load_dotenv
    load_dotenv()

    parser = argparse.ArgumentParser(description="Sitemap Generator & Submitter")
    sub = parser.add_subparsers(dest="cmd")

    gen_p = sub.add_parser("generate", help="Generate XML sitemap from crawl data")
    gen_p.add_argument("--base-url", required=True)
    gen_p.add_argument("--output", default="sitemap.xml")
    gen_p.add_argument("--changefreq", default="weekly", choices=["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"])

    img_p = sub.add_parser("generate-images", help="Generate image sitemap")
    img_p.add_argument("--base-url", required=True)
    img_p.add_argument("--output", default="sitemap-images.xml")

    now_p = sub.add_parser("indexnow", help="Submit URLs to IndexNow")
    now_p.add_argument("--urls-file", required=True)
    now_p.add_argument("--host", required=True)

    gsc_p = sub.add_parser("submit-google", help="Submit sitemap to Google Search Console")
    gsc_p.add_argument("--sitemap-url", required=True)

    parsed = parser.parse_args(args)
    db = os.getenv("DB_PATH", "report.db")

    if parsed.cmd == "generate":
        cmd_generate(db, parsed.base_url, parsed.output, parsed.changefreq)
    elif parsed.cmd == "generate-images":
        cmd_generate_images(db, parsed.base_url, parsed.output)
    elif parsed.cmd == "indexnow":
        cmd_indexnow(parsed.urls_file, parsed.host)
    elif parsed.cmd == "submit-google":
        cmd_submit_google(parsed.sitemap_url)
    else:
        parser.print_help()
