from fastapi import APIRouter
from app.api.v1 import (
    projects, rank_tracker, keywords, site_explorer,
    site_audit, gsc, analytics, content, brand_radar,
    competitive, social, advertising, local_seo,
    reporting, alerts, settings, jobs,
)

router = APIRouter()
router.include_router(projects.router, prefix="/projects", tags=["Projects"])
router.include_router(rank_tracker.router, prefix="/rank-tracker", tags=["Rank Tracker"])
router.include_router(keywords.router, prefix="/keywords", tags=["Keywords"])
router.include_router(site_explorer.router, prefix="/site-explorer", tags=["Site Explorer"])
router.include_router(site_audit.router, prefix="/site-audit", tags=["Site Audit"])
router.include_router(gsc.router, prefix="/gsc", tags=["GSC"])
router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
router.include_router(content.router, prefix="/content", tags=["Content"])
router.include_router(brand_radar.router, prefix="/brand-radar", tags=["Brand Radar"])
router.include_router(competitive.router, prefix="/competitive", tags=["Competitive Intel"])
router.include_router(social.router, prefix="/social", tags=["Social Media"])
router.include_router(advertising.router, prefix="/advertising", tags=["Advertising"])
router.include_router(local_seo.router, prefix="/local-seo", tags=["Local SEO"])
router.include_router(reporting.router, prefix="/reporting", tags=["Reporting"])
router.include_router(alerts.router, prefix="/alerts", tags=["Alerts"])
router.include_router(settings.router, prefix="/settings", tags=["Settings"])
router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
