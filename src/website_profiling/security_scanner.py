"""
Security and vulnerability scanner for crawled sites.
Passive checks use crawl data only; optional active checks send controlled probes.
Only use active scanning on sites you are authorized to test.
"""
from typing import Any, Optional
from urllib.parse import parse_qs, urlencode, urlparse, urlunparse

import pandas as pd

# Param names often used for redirects (open-redirect risk)
OPEN_REDIRECT_PARAMS = frozenset({"redirect", "url", "next", "return", "returnUrl", "return_url", "redir", "destination", "dest", "target", "goto", "out", "view", "to"})


def _finding(
    finding_type: str,
    severity: str,
    url: str,
    message: str,
    recommendation: str,
    evidence: Optional[str] = None,
) -> dict:
    out = {
        "finding_type": finding_type,
        "severity": severity,
        "url": url,
        "message": message,
        "recommendation": recommendation,
    }
    if evidence is not None:
        out["evidence"] = evidence
    return out


def _passive_headers(df: pd.DataFrame) -> list[dict]:
    """Emit one finding per missing header type (first URL that lacks it) to avoid flooding the report."""
    findings = []
    seen: set[str] = set()
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    if len(success_df) == 0:
        return findings

    for _, row in success_df.iterrows():
        url = str(row.get("url", "")).strip()
        if not url:
            continue

        hsts = (row.get("strict_transport_security") or "").strip() if pd.notna(row.get("strict_transport_security")) else ""
        if not hsts and "missing_hsts" not in seen:
            seen.add("missing_hsts")
            findings.append(_finding(
                "missing_hsts",
                "High",
                url,
                "Strict-Transport-Security header not set.",
                "Add Strict-Transport-Security (e.g. max-age=31536000; includeSubDomains) to enforce HTTPS.",
            ))

        xcto = (row.get("x_content_type_options") or "").strip() if pd.notna(row.get("x_content_type_options")) else ""
        if not xcto and "missing_x_content_type_options" not in seen:
            seen.add("missing_x_content_type_options")
            findings.append(_finding(
                "missing_x_content_type_options",
                "Medium",
                url,
                "X-Content-Type-Options header not set.",
                "Add X-Content-Type-Options: nosniff to prevent MIME sniffing.",
            ))

        xfo = (row.get("x_frame_options") or "").strip() if pd.notna(row.get("x_frame_options")) else ""
        if not xfo and "missing_x_frame_options" not in seen:
            seen.add("missing_x_frame_options")
            findings.append(_finding(
                "missing_x_frame_options",
                "Medium",
                url,
                "X-Frame-Options header not set.",
                "Add X-Frame-Options: DENY or SAMEORIGIN to reduce clickjacking risk.",
            ))

        csp = (row.get("content_security_policy") or "").strip() if pd.notna(row.get("content_security_policy")) else ""
        if not csp and "missing_csp" not in seen:
            seen.add("missing_csp")
            findings.append(_finding(
                "missing_csp",
                "Medium",
                url,
                "Content-Security-Policy header not set.",
                "Add a Content-Security-Policy to mitigate XSS and injection.",
            ))

    return findings


def _passive_https(df: pd.DataFrame) -> list[dict]:
    """Emit findings for HTTP URLs (final_url or start)."""
    findings = []
    if "final_url" not in df.columns or len(df) == 0:
        return findings
    for _, row in df.iterrows():
        final = str(row.get("final_url", "")).strip()
        if final.lower().startswith("http://"):
            findings.append(_finding(
                "http_final_url",
                "Critical",
                row.get("url", final),
                "URL resolves to HTTP (insecure).",
                "Ensure all pages redirect to HTTPS.",
                evidence=final,
            ))
    return findings


def _passive_open_redirect_risk(df: pd.DataFrame, start_url: str) -> list[dict]:
    """Passive: URLs with redirect/url/next/return params pointing to external hosts (no request)."""
    findings = []
    parsed_start = urlparse(start_url)
    start_netloc = (parsed_start.netloc or "").lower()

    for _, row in df.iterrows():
        url_str = str(row.get("url", "")).strip()
        if not url_str:
            continue
        parsed = urlparse(url_str)
        query = parsed.query
        if not query:
            continue
        params = parse_qs(query, keep_blank_values=True)
        for param_name in OPEN_REDIRECT_PARAMS:
            if param_name not in params:
                continue
            for value in params[param_name]:
                if not value or not isinstance(value, str):
                    continue
                value = value.strip()
                if not value.startswith(("http://", "https://")):
                    continue
                p = urlparse(value)
                other_netloc = (p.netloc or "").lower()
                if other_netloc and other_netloc != start_netloc:
                    findings.append(_finding(
                        "open_redirect_risk",
                        "Low",
                        url_str,
                        f"Query parameter '{param_name}' contains external URL (potential open redirect).",
                        "Validate redirect targets to same origin or allowlist; do not redirect to user-controlled URLs.",
                        evidence=value[:200],
                    ))
                    break
    return findings


def _passive_mixed_content(df: pd.DataFrame, start_url: str) -> list[dict]:
    """Emit findings for mixed content on HTTPS pages."""
    findings = []
    if parsed_scheme(urlparse(start_url)) != "https":
        return findings
    if "mixed_content_count" not in df.columns:
        return findings
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    for _, row in success_df.iterrows():
        mixed = pd.to_numeric(row.get("mixed_content_count"), errors="coerce")
        if pd.isna(mixed) or int(mixed) <= 0:
            continue
        url = str(row.get("url", "")).strip()
        findings.append(_finding(
            "mixed_content",
            "High",
            url,
            f"Page loads {int(mixed)} HTTP resource(s) over HTTPS (mixed content).",
            "Load all resources over HTTPS to avoid mixed content and downgrade attacks.",
            evidence=str(int(mixed)),
        ))
    return findings


def parsed_scheme(parsed) -> str:
    return (parsed.scheme or "").lower()


def _passive_html_checks(
    df: pd.DataFrame,
    start_url: str,
    max_urls_to_probe: int,
    timeout: int,
    polite_delay: float,
) -> list[dict]:
    """Re-fetch a sample of URLs and check for forms without CSRF and reflected query params (passive)."""
    import re
    import time
    import requests
    from bs4 import BeautifulSoup

    findings: list[dict] = []
    parsed_start = urlparse(start_url)
    base_netloc = (parsed_start.netloc or "").lower()
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    urls = success_df["url"].dropna().astype(str).str.strip().unique().tolist()[:max_urls_to_probe]
    session = requests.Session()
    session.headers.update({"User-Agent": "WebsiteProfiling-SecurityScan/1.0"})
    csrf_pattern = re.compile(r"csrf|token|_token|authenticity_token|_csrf", re.I)

    for url in urls:
        if polite_delay:
            time.sleep(polite_delay)
        try:
            parsed_u = urlparse(url)
            if (parsed_u.netloc or "").lower() != base_netloc:
                continue
            r = session.get(url, timeout=timeout, allow_redirects=True)
            if r.status_code != 200 or "text/html" not in (r.headers.get("Content-Type") or "").lower():
                continue
            html = r.text
            soup = BeautifulSoup(html, "lxml")

            # Forms without CSRF token
            for form in soup.find_all("form"):
                method = (form.get("method") or "get").strip().lower()
                if method != "post":
                    continue
                has_csrf = False
                for inp in form.find_all("input", {"name": True}):
                    name = (inp.get("name") or "").strip()
                    if csrf_pattern.search(name):
                        has_csrf = True
                        break
                if not has_csrf:
                    findings.append(_finding(
                        "form_without_csrf",
                        "Medium",
                        url,
                        "POST form has no obvious CSRF token (hidden input with csrf/token in name).",
                        "Add a CSRF token (e.g. hidden input or SameSite cookie) to prevent cross-site request forgery.",
                    ))
                    break

            # Reflected query param (passive: param value appears in body)
            query = parsed_u.query
            if query:
                params = parse_qs(query, keep_blank_values=True)
                for pname, values in params.items():
                    for v in values:
                        if not v or len(v) < 3 or len(v) > 200:
                            continue
                        # Avoid matching common boilerplate
                        if v.lower() in ("true", "false", "0", "1", "yes", "no"):
                            continue
                        escaped = re.escape(v)
                        if re.search(r">\s*" + escaped + r"\s*<", html) or re.search(r'"\s*' + escaped + r'\s*"', html):
                            findings.append(_finding(
                                "reflected_param",
                                "Low",
                                url,
                                f"Query parameter '{pname}' value may be reflected in response (XSS risk if unescaped).",
                                "Encode user input for HTML/JS context; use CSP and safe output encoding.",
                                evidence=pname,
                            ))
                            break
        except Exception:
            continue

    return findings


def run_security_scan(
    df: pd.DataFrame,
    start_url: str = "",
    run_active: bool = False,
    max_urls_to_probe: int = 20,
    timeout: int = 10,
    polite_delay: float = 0.2,
) -> list[dict]:
    """
    Run passive (and optionally active) security checks on crawl DataFrame.
    Returns a list of findings: finding_type, severity, url, message, recommendation, optional evidence.
    Only use run_active=True on sites you are authorized to test.
    """
    findings: list[dict] = []
    # Passive: no extra requests
    findings.extend(_passive_headers(df))
    findings.extend(_passive_https(df))
    findings.extend(_passive_open_redirect_risk(df, start_url))
    findings.extend(_passive_mixed_content(df, start_url))

    # Passive HTML checks: re-fetch sample of URLs for forms/reflection (skip when active to avoid double fetch)
    if not run_active and max_urls_to_probe > 0:
        findings.extend(_passive_html_checks(df, start_url, max_urls_to_probe, timeout, polite_delay))

    if run_active:
        findings.extend(_active_checks(df, start_url, max_urls_to_probe, timeout, polite_delay))

    return findings


def _active_checks(
    df: pd.DataFrame,
    start_url: str,
    max_urls_to_probe: int,
    timeout: int,
    polite_delay: float,
) -> list[dict]:
    """Opt-in active checks: reflected XSS probe, open redirect probe, optional SQLi (rate-limited)."""
    import time
    import requests

    findings: list[dict] = []
    parsed = urlparse(start_url)
    base_netloc = (parsed.netloc or "").lower()
    scheme = parsed_scheme(parsed) or "https"
    base_url = f"{scheme}://{parsed.netloc}"

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else pd.DataFrame()
    urls = success_df["url"].dropna().astype(str).str.strip().unique().tolist()[:max_urls_to_probe]
    session = requests.Session()
    session.headers.update({"User-Agent": "WebsiteProfiling-SecurityScan/1.0"})

    # Unique token for reflection check (no script execution)
    xss_token = "WpSecScanXssReflect"
    sql_error_indicators = [
        "sql syntax",
        "mysql_fetch",
        "ora-01",
        "postgresql",
        "sqlite_",
        "warning: pg_",
        "unclosed quotation",
        "syntax error",
        "odbc ",
        "driver ",
        "jdbc ",
    ]

    for url in urls:
        if polite_delay:
            time.sleep(polite_delay)
        try:
            parsed_u = urlparse(url)
            if (parsed_u.netloc or "").lower() != base_netloc:
                continue
            path = parsed_u.path or "/"
            query = parsed_u.query
            params = parse_qs(query, keep_blank_values=True) if query else {}

            # Reflected XSS: append token to first query param and check response
            if params:
                param_names = list(params.keys())[:3]
                for pname in param_names:
                    test_params = dict(params)
                    test_params[pname] = [xss_token]
                    new_query = urlencode(test_params, doseq=True)
                    probe_url = urlunparse((parsed_u.scheme, parsed_u.netloc, path, parsed_u.params, new_query, ""))
                    try:
                        r = session.get(probe_url, timeout=timeout, allow_redirects=True)
                        if r.status_code != 200:
                            continue
                        text = (r.text or "").lower()
                        if xss_token.lower() in text:
                            # Check if unescaped (dangerous)
                            if f">{xss_token}<" in text or f'">{xss_token}<' in text or f"'{xss_token}'" in text:
                                findings.append(_finding(
                                    "xss_reflected",
                                    "High",
                                    probe_url,
                                    f"Parameter '{pname}' value may be reflected unescaped (XSS risk).",
                                    "Encode user input for HTML/JS context; use CSP and safe output encoding.",
                                    evidence=pname,
                                ))
                            break
                    except Exception:
                        pass
                    if polite_delay:
                        time.sleep(polite_delay)

            # Open redirect: add redirect param to external URL and check Location
            redirect_param = "redirect"
            if redirect_param not in (k.lower() for k in params.keys()):
                test_params = dict(params)
                test_params["redirect"] = ["https://example.com/"]
                new_query = urlencode(test_params, doseq=True)
                probe_url = urlunparse((parsed_u.scheme, parsed_u.netloc, path, parsed_u.params, new_query, ""))
                try:
                    r = session.get(probe_url, timeout=timeout, allow_redirects=False)
                    if r.status_code in (301, 302, 303, 307, 308):
                        loc = (r.headers.get("Location") or "").strip()
                        if "example.com" in loc.lower():
                            findings.append(_finding(
                                "open_redirect",
                                "Medium",
                                url,
                                "Redirect parameter accepts external URL (open redirect).",
                                "Validate redirect target to same origin or allowlist.",
                                evidence=loc[:200],
                            ))
                except Exception:
                    pass

            # SQLi error-based: single quote in common param
            for pname in ["id", "page", "q", "search", "query", "cat"][:2]:
                if pname not in params and not params:
                    test_params = {pname: ["'"]}
                elif pname in params:
                    test_params = dict(params)
                    test_params[pname] = ["'"]
                else:
                    continue
                new_query = urlencode(test_params, doseq=True)
                probe_url = urlunparse((parsed_u.scheme, parsed_u.netloc, path, parsed_u.params, new_query, ""))
                try:
                    r = session.get(probe_url, timeout=timeout, allow_redirects=True)
                    if r.status_code != 200:
                        continue
                    body = (r.text or "").lower()
                    for indicator in sql_error_indicators:
                        if indicator in body:
                            findings.append(_finding(
                                "sql_error_exposed",
                                "High",
                                url,
                                "Response may contain SQL error (possible SQLi or information disclosure).",
                                "Use parameterized queries; do not expose DB errors to users.",
                                evidence=indicator[:50],
                            ))
                            break
                except Exception:
                    pass
                if polite_delay:
                    time.sleep(polite_delay)

        except Exception:
            continue

    return findings
