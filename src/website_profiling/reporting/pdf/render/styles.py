"""ReportLab style constants mirroring the HTML CSS design tokens."""
from __future__ import annotations

# Colour palette — mirrors _report_html_styles() CSS variables
INK = "#0f172a"
MUTED = "#64748b"
BORDER = "#e2e8f0"
SURFACE_MUTED = "#f8fafc"
BRAND = "#0b0f19"
BRAND_ACCENT = "#2563eb"

GOOD = "#059669"
GOOD_BG = "#ecfdf5"
FAIR = "#d97706"
FAIR_BG = "#fffbeb"
POOR = "#dc2626"
POOR_BG = "#fef2f2"

CRITICAL_FG = "#991b1b"
CRITICAL_BG = "#fee2e2"
HIGH_FG = "#c2410c"
HIGH_BG = "#ffedd5"
MEDIUM_FG = "#a16207"
MEDIUM_BG = "#fef3c7"
LOW_FG = "#475569"
LOW_BG = "#f1f5f9"

HEADER_BG = "#f1f5f9"

# Column widths (inches) for common patterns
COL_NARROW = 0.75
COL_MEDIUM = 1.5
COL_WIDE = 2.5
COL_URL = 2.0

# Letter page with 0.65" margins — keep all flowables on this width for alignment
PAGE_MARGIN_IN = 0.65
PAGE_WIDTH_IN = 8.5
CONTENT_WIDTH_IN = PAGE_WIDTH_IN - 2 * PAGE_MARGIN_IN  # 7.2
GRID_COLS = 4

PRIORITY_TONES = {
    "critical": (CRITICAL_FG, CRITICAL_BG),
    "high": (HIGH_FG, HIGH_BG),
    "medium": (MEDIUM_FG, MEDIUM_BG),
    "low": (LOW_FG, LOW_BG),
}

SCORE_TONES = {
    "score-good": GOOD,
    "score-fair": FAIR,
    "score-poor": POOR,
    "score-na": MUTED,
}
