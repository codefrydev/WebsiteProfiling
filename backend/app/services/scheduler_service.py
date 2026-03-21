from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

scheduler = AsyncIOScheduler()


def setup_scheduler(app):
    @app.on_event("startup")
    async def start_scheduler():
        scheduler.add_job(check_keyword_rankings, CronTrigger(hour=0, minute=0), id="rank_check", replace_existing=True)
        scheduler.add_job(sync_gsc_data, CronTrigger(hour=2, minute=0), id="gsc_sync", replace_existing=True)
        scheduler.add_job(check_alerts, "interval", minutes=15, id="alert_check", replace_existing=True)
        scheduler.start()

    @app.on_event("shutdown")
    async def stop_scheduler():
        scheduler.shutdown()


async def check_keyword_rankings():
    from app.db.session import async_session_factory
    from app.db.models.rank_tracker import TrackedKeyword
    from app.db.models.jobs import Job
    from sqlalchemy import select

    async with async_session_factory() as session:
        result = await session.execute(
            select(TrackedKeyword).where(TrackedKeyword.is_active == True).limit(100)
        )
        keywords = result.scalars().all()

        project_ids = set(kw.project_id for kw in keywords)
        for project_id in project_ids:
            job = Job(project_id=project_id, type="rank_check", status="pending")
            session.add(job)

        await session.commit()


async def sync_gsc_data():
    from app.db.session import async_session_factory
    from app.db.models.gsc import GscProperty
    from app.db.models.jobs import Job
    from sqlalchemy import select

    async with async_session_factory() as session:
        result = await session.execute(select(GscProperty))
        properties = result.scalars().all()

        for prop in properties:
            job = Job(type="gsc_sync", status="pending", result={"property_id": prop.id})
            session.add(job)

        await session.commit()


async def check_alerts():
    from app.db.session import async_session_factory
    from app.db.models.alerts import Alert
    from sqlalchemy import select

    async with async_session_factory() as session:
        result = await session.execute(
            select(Alert).where(Alert.is_active == True)
        )
        alerts = result.scalars().all()
        # Alert evaluation logic would be implemented per alert type
