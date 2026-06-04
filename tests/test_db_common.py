import json

import pytest


def test_parse_json_field_handles_dict_list_str_and_bad_json() -> None:
    from website_profiling.db._common import _parse_json_field

    assert _parse_json_field(None) is None
    assert _parse_json_field({"a": 1}) == {"a": 1}
    assert _parse_json_field([1, 2]) == [1, 2]
    assert _parse_json_field('{"x": 2}') == {"x": 2}
    assert _parse_json_field("not-json") == "not-json"


def test_row_field_and_parse_row_json() -> None:
    from website_profiling.db._common import _parse_row_json, _row_field

    dict_row = {"data": {"gsc_full": {"top_queries": []}}, "id": 7}
    assert _row_field(dict_row, "id") == 7
    assert _parse_row_json(dict_row) == {"gsc_full": {"top_queries": []}}

    tuple_row = ('{"a": 1}',)
    assert _row_field(tuple_row, "data", index=0) == '{"a": 1}'
    assert _parse_row_json(tuple_row, "data", index=0) == {"a": 1}

    assert _parse_row_json(None) is None
    assert _parse_row_json({"data": {"x": 2}}) == {"x": 2}


def test_sanitize_for_json_converts_nan_inf_and_numpy_like_item() -> None:
    from website_profiling.db._common import _sanitize_for_json

    class N:
        def __init__(self, v):
            self._v = v

        def item(self):
            return self._v

    out = _sanitize_for_json({"a": float("nan"), "b": float("inf"), "c": N(5)})
    assert out == {"a": None, "b": None, "c": 5}

    # must be JSON-serializable
    json.dumps(out)

