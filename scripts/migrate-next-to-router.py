#!/usr/bin/env python3
"""One-shot migration: replace next/link, next/navigation, next/dynamic in web/src."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "web" / "src"

LINK_IMPORT = re.compile(
    r"import Link from ['\"]next/link['\"];?\n?"
)
NAV_IMPORT = re.compile(
    r"import \{([^}]+)\} from ['\"]next/navigation['\"];?\n?"
)
DYNAMIC_IMPORT = re.compile(r"import dynamic from ['\"]next/dynamic['\"];?\n?")


def migrate_file(path: Path) -> bool:
    text = path.read_text()
    original = text

    text = LINK_IMPORT.sub("import { Link } from 'react-router-dom';\n", text)
    text = DYNAMIC_IMPORT.sub("", text)

    def nav_repl(m: re.Match[str]) -> str:
        names = [n.strip() for n in m.group(1).split(",")]
        mapping = {
            "useRouter": "useNavigate",
            "usePathname": None,  # useLocation
            "useSearchParams": "useSearchParams",
            "useParams": "useParams",
            "notFound": None,
            "redirect": None,
        }
        out: list[str] = []
        needs_location = "usePathname" in names
        for n in names:
            if n == "usePathname":
                continue
            if n == "notFound":
                continue
            out.append(mapping.get(n, n))
        imports = list(dict.fromkeys(out))
        if needs_location:
            imports = ["useLocation", *imports]
        return f"import {{ {', '.join(imports)} }} from 'react-router-dom';\n"

    text = NAV_IMPORT.sub(nav_repl, text)

    # Link href -> to
    text = re.sub(r"<Link(\s+)href=", r"<Link\1to=", text)

    # useRouter -> useNavigate
    text = re.sub(r"\bconst router = useRouter\(\)", "const navigate = useNavigate()", text)
    text = re.sub(r"\bconst router = useNavigate\(\)", "const navigate = useNavigate()", text)

    # usePathname -> useLocation
    if "useLocation" in text and "usePathname" in text:
        text = re.sub(
            r"\bconst pathname = usePathname\(\)",
            "const { pathname } = useLocation()",
            text,
        )

    # useSearchParams destructuring
    text = re.sub(
        r"\bconst searchParams = useSearchParams\(\)",
        "const [searchParams] = useSearchParams()",
        text,
    )

    # router.push/replace -> navigate
    text = re.sub(
        r"router\.replace\(([^,)]+),\s*\{\s*scroll:\s*false\s*\}\)",
        r"navigate(\1, { replace: true, preventScrollReset: true })",
        text,
    )
    text = re.sub(r"router\.replace\(", "navigate(", text)
    text = re.sub(r"router\.push\(", "navigate(", text)
    text = re.sub(r"router\.back\(", "navigate(-1", text)

    # navigate(x) from replace needs { replace: true } when it was router.replace without scroll option
    # Fix navigate calls that came from router.replace(single arg) - already handled above except
    # we need replace: true for plain router.replace(path)
    # Re-run: navigate(q ? ... : pathname) from replace should have replace: true
    # Heuristic: lines with navigate( that were from replace - hard to fix automatically.
    # Manual fix for ReportShell etc.

    # goToPipeline(router.push -> goToPipeline(navigate
    text = text.replace("goToPipeline(router.push", "goToPipeline(navigate")

    # next/dynamic -> lazy
    text = re.sub(
        r"const (\w+) = dynamic\(\(\) => import\(([^)]+)\),\s*\{[^}]*loading:[^}]*\}\);",
        r"const \1 = lazy(() => import(\2));",
        text,
    )
    text = re.sub(
        r"const (\w+) = dynamic\(\(\) => import\(([^)]+)\),\s*\{[^}]*ssr:\s*false,[^}]*\}\);",
        r"const \1 = lazy(() => import(\2));",
        text,
    )

    # Add lazy import if lazy( used
    if "lazy(" in text and "from 'react'" in text:
        if re.search(r"import \{[^}]*\blazy\b", text):
            pass
        elif re.search(r"import \{([^}]+)\} from 'react'", text):
            text = re.sub(
                r"import \{([^}]+)\} from 'react'",
                lambda m: f"import {{ {m.group(1).strip()}, lazy }} from 'react'"
                if "lazy" not in m.group(1)
                else m.group(0),
                text,
                count=1,
            )
        else:
            text = "import { lazy } from 'react';\n" + text

    # process.env.NODE_ENV -> import.meta.env.DEV / PROD
    text = text.replace("process.env.NODE_ENV !== 'production'", "import.meta.env.DEV")
    text = text.replace("process.env.NODE_ENV === 'production'", "import.meta.env.PROD")

    if text != original:
        path.write_text(text)
        return True
    return False


def main() -> None:
    changed = 0
    for path in ROOT.rglob("*"):
        if path.suffix not in {".ts", ".tsx"}:
            continue
        if migrate_file(path):
            changed += 1
            print(path.relative_to(ROOT.parent))
    print(f"Updated {changed} files")


if __name__ == "__main__":
    main()
