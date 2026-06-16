# Python tests layout

Pytest discovers all `test_*.py` files under `tests/`. Shared helpers live at the package root (`conftest.py`, `db_test_fakes.py`, `fixtures/`).

## Directory gates (mirror source packages)

| Directory | Source package | Coverage config | CI / local gate |
|-----------|----------------|-----------------|-----------------|
| `tests/reporting/` | `website_profiling.reporting` | `.coveragerc.reporting` | `pytest tests/reporting/` |
| `tests/tools/` | `website_profiling.tools` | `.coveragerc.tools` | `pytest tests/tools/` |
| `tests/content_studio/` | `website_profiling.content_studio` | `.coveragerc` (core) | included in `pytest tests/` |

Add new reporting or tools tests inside the matching directory — no need to edit file lists in `ci.yml` or `local-test.sh`.

**Fixtures:** shared files live in `tests/fixtures/`. Subpackage tests should import via `from tests.conftest import FIXTURES` (not `Path(__file__).parent / "fixtures"`).

## Content Studio

```
tests/content_studio/
  fakes.py           # shared LLM client doubles
  test_agent.py      # tool-calling analyze loop
  test_ai_suggest.py # rule/AI suggestions orchestration
  test_score.py      # GSC + on-page scoring
  test_tools.py      # deterministic analyze tools
```

## Core (everything else)

Remaining `tests/test_*.py` files cover the core gate (100% on all packages except `reporting/`, `tools/`, and other omits in `.coveragerc`).

Browser integration tests stay at the top level (`test_crawl_fetchers.py`, `test_crawler_browser_e2e.py`) and run via `@pytest.mark.browser`.
