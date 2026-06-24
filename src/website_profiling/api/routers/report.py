"""Report data routers — /api/report/* — ported to the .NET Data service."""
# All routes previously here have been moved to services/Data.
# This file is intentionally empty; the router is kept only to avoid import errors
# in code that references report.router until the include_router call is removed.
from fastapi import APIRouter

router = APIRouter(prefix="/report", tags=["report"])
