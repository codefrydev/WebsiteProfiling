"""Content drafts list must work with psycopg dict_row (pool default)."""
from __future__ import annotations

from typing import Any

from website_profiling.db.content_draft_store import list_content_drafts
from website_profiling.db.pool import db_session


def test_list_content_drafts_with_rows(test_property: dict[str, Any]) -> None:
    property_id = int(test_property["id"])
    with db_session() as conn:

        conn.execute(
            "DELETE FROM content_drafts WHERE property_id = %s AND title = 'Dict row test'",
            (property_id,),
        )
        conn.execute(
            """INSERT INTO content_drafts (property_id, title, target_keyword)
               VALUES (%s, 'Dict row test', 'seo')""",
            (property_id,),
        )
        conn.commit()

        drafts = list_content_drafts(conn, property_id)
        assert len(drafts) >= 1
        draft = next(d for d in drafts if d["title"] == "Dict row test")
        assert draft["property_id"] == property_id
        assert draft["target_keyword"] == "seo"
