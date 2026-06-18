"""PdfBuildOptions, PdfLimits, and document profiles."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal, Optional

Profile = Literal["executive", "standard", "full"]

# Sections for each profile; None in sections means "use profile default"
_PROFILE_SECTIONS: dict[str, list[str]] = {
    "executive": ["core"],
    "standard": ["core", "findings", "appendix"],
    "full": ["core", "findings", "lighthouse", "security", "traffic", "keywords",
             "indexation", "content", "links", "appendix"],
}


@dataclass
class PdfLimits:
    issues_total: int = 120
    issues_per_group: int = 25
    top_issues_cover: int = 6
    urls_sample: int = 20
    metric_table_rows: int = 15
    gsc_queries: int = 10
    keyword_rows: int = 15
    diagnostic_items: int = 20


@dataclass
class PdfBuildOptions:
    profile: Profile = "standard"
    sections: Optional[list[str]] = None   # None → derive from profile
    limits: PdfLimits = field(default_factory=PdfLimits)
    include_appendix: bool = True
    include_recommendations: bool = True
    include_glossary: bool = True
    report_id: Optional[int] = None

    def effective_sections(self) -> list[str]:
        if self.sections is not None:
            return self.sections
        return _PROFILE_SECTIONS.get(self.profile, _PROFILE_SECTIONS["standard"])
