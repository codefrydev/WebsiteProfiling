"""PdfDocument v1 — versioned, block-based document model.

All types are JSON-serializable dataclasses.  The renderer consumes these;
no ReportLab types appear here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

SCHEMA_VERSION = "1.0"

# ---------------------------------------------------------------------------
# Primitive / shared
# ---------------------------------------------------------------------------

PriorityTone = Literal["critical", "high", "medium", "low", "neutral", "good", "fair", "poor"]
DocumentKind = Literal["audit", "compare"]


@dataclass
class PdfTruncation:
    shown: int
    total: int
    reason: Literal["limit", "page_budget", "empty"] = "limit"
    continue_in: list[str] = field(default_factory=lambda: ["CSV", "workbook"])


# ---------------------------------------------------------------------------
# Block types — renderer handles each `type` discriminator
# ---------------------------------------------------------------------------

@dataclass
class HeadingBlock:
    type: str = field(default="heading", init=False)
    id: str = ""
    text: str = ""
    level: int = 2          # 2 = section heading, 3 = sub-heading
    visible: bool = True


@dataclass
class ParagraphBlock:
    type: str = field(default="paragraph", init=False)
    id: str = ""
    text: str = ""
    italic: bool = False
    visible: bool = True


@dataclass
class CalloutBlock:
    type: str = field(default="callout", init=False)
    id: str = ""
    text: str = ""
    severity: Literal["info", "warn", "critical"] = "info"
    visible: bool = True


@dataclass
class SpacerBlock:
    type: str = field(default="spacer", init=False)
    id: str = ""
    height_pt: float = 8.0
    visible: bool = True


@dataclass
class KpiItem:
    label: str
    value: str
    delta: Optional[str] = None
    tone: PriorityTone = "neutral"
    help: Optional[str] = None


@dataclass
class KpiRowBlock:
    type: str = field(default="kpi_row", init=False)
    id: str = ""
    items: list[KpiItem] = field(default_factory=list)
    visible: bool = True


@dataclass
class StatChip:
    label: str
    value: str
    tone: PriorityTone = "neutral"


@dataclass
class StatGridBlock:
    type: str = field(default="stat_grid", init=False)
    id: str = ""
    chips: list[StatChip] = field(default_factory=list)
    columns: int = 4
    visible: bool = True


@dataclass
class KeyValueBlock:
    type: str = field(default="key_value", init=False)
    id: str = ""
    rows: list[tuple[str, str]] = field(default_factory=list)
    layout: Literal["default", "audit", "glossary"] = "default"
    visible: bool = True


@dataclass
class ScoreCard:
    name: str
    score: Optional[str]    # formatted string, e.g. "87" or "—"
    issue_count: int = 0
    tone: Literal["score-good", "score-fair", "score-poor", "score-na"] = "score-na"


@dataclass
class ScoreCardsBlock:
    type: str = field(default="score_cards", init=False)
    id: str = ""
    cards: list[ScoreCard] = field(default_factory=list)
    visible: bool = True


@dataclass
class TableColumn:
    key: str
    label: str
    width: Literal["narrow", "medium", "wide", "url"] = "medium"
    align: Literal["left", "center", "right"] = "left"


@dataclass
class MetricTableBlock:
    type: str = field(default="metric_table", init=False)
    id: str = ""
    columns: list[TableColumn] = field(default_factory=list)
    rows: list[dict[str, str]] = field(default_factory=list)
    repeat_header: bool = True
    truncation: Optional[PdfTruncation] = None
    visible: bool = True


@dataclass
class UrlListBlock:
    type: str = field(default="url_list", init=False)
    id: str = ""
    rows: list[dict[str, str]] = field(default_factory=list)   # keys: url, status, title
    show_title: bool = True
    truncation: Optional[PdfTruncation] = None
    visible: bool = True


# ---------------------------------------------------------------------------
# Issue blocks — primary findings format
# ---------------------------------------------------------------------------

@dataclass
class PdfIssueMetrics:
    gsc_clicks: Optional[int] = None
    gsc_impressions: Optional[int] = None
    ga4_sessions: Optional[int] = None
    impact_score: Optional[float] = None
    lh_audit_id: Optional[str] = None


@dataclass
class PdfIssue:
    id: str
    priority: str
    category: str
    headline: str           # ≤ 80 chars, no embedded URL duplication
    url: Optional[str] = None
    path: Optional[str] = None   # display-only short path
    detail: Optional[str] = None
    recommendation: Optional[str] = None
    metrics: Optional[PdfIssueMetrics] = None
    tags: list[str] = field(default_factory=list)
    related_urls: list[str] = field(default_factory=list)  # collapsed duplicates


@dataclass
class IssueGroupBlock:
    type: str = field(default="issue_group", init=False)
    id: str = ""
    title: str = ""
    group_label: str = ""    # e.g. "Critical — 1 issue"
    issues: list[PdfIssue] = field(default_factory=list)
    render_as: Literal["list", "compact_table"] = "list"
    truncation: Optional[PdfTruncation] = None
    visible: bool = True


@dataclass
class IssueTableBlock:
    """Fallback tabular rendering for dense medium/low groups."""
    type: str = field(default="issue_table", init=False)
    id: str = ""
    title: str = ""
    issues: list[PdfIssue] = field(default_factory=list)
    truncation: Optional[PdfTruncation] = None
    visible: bool = True


@dataclass
class MarkdownBlock:
    type: str = field(default="markdown", init=False)
    id: str = ""
    text: str = ""
    visible: bool = True


# Union type for IDE / type-checkers
PdfBlock = (
    HeadingBlock
    | ParagraphBlock
    | CalloutBlock
    | SpacerBlock
    | KpiRowBlock
    | StatGridBlock
    | KeyValueBlock
    | ScoreCardsBlock
    | MetricTableBlock
    | UrlListBlock
    | IssueGroupBlock
    | IssueTableBlock
    | MarkdownBlock
)

# ---------------------------------------------------------------------------
# Cover
# ---------------------------------------------------------------------------

@dataclass
class PdfScoreHero:
    score: Optional[str]
    band: Literal["score-good", "score-fair", "score-poor", "score-na"]
    label: str    # e.g. "Overall health score"


@dataclass
class PdfCoverBlock:
    headline: str
    subtitle: str
    hero: PdfScoreHero
    priority_strip: StatGridBlock
    category_scores: ScoreCardsBlock
    executive_summary: Optional[str] = None   # prose paragraph
    executive_source: Optional[str] = None
    priorities_list: list[str] = field(default_factory=list)
    top_issues: list[PdfIssue] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Section
# ---------------------------------------------------------------------------

@dataclass
class PdfSection:
    id: str
    section_key: str
    title: str
    priority: int = 50           # lower = earlier in document
    page_break_before: bool = False
    keep_with_next_blocks: int = 1
    source_label: Optional[str] = None
    provenance: Optional[str] = None
    blocks: list[Any] = field(default_factory=list)   # list[PdfBlock]
    truncation: Optional[PdfTruncation] = None


# ---------------------------------------------------------------------------
# Appendix
# ---------------------------------------------------------------------------

@dataclass
class PdfAppendix:
    url_sample: Optional[UrlListBlock] = None
    audit_details: Optional[KeyValueBlock] = None
    glossary: Optional[KeyValueBlock] = None


# ---------------------------------------------------------------------------
# Meta / Footer
# ---------------------------------------------------------------------------

@dataclass
class PdfMeta:
    report_id: Optional[int]
    property: str
    report_title: str
    generated_at: str      # formatted for display
    exported_at: str
    data_sources: list[str]
    health_score: Optional[int]
    issue_counts: dict[str, int]   # {critical, high, medium, low}
    truncation_summary: list[str] = field(default_factory=list)
    included_sections: list[str] = field(default_factory=list)
    locale: str = "en"


@dataclass
class PdfFooterBlock:
    confidential_note: str = "Confidential — prepared for client review."
    generator: str = "Site Audit"
    exported_at: str = ""


# ---------------------------------------------------------------------------
# Root document
# ---------------------------------------------------------------------------

@dataclass
class PdfDocument:
    schema_version: str
    document_kind: DocumentKind
    meta: PdfMeta
    cover: PdfCoverBlock
    sections: list[PdfSection]
    footer: PdfFooterBlock
    appendix: Optional[PdfAppendix] = None
