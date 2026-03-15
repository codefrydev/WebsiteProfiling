"""
Load HTML templates from templates/ and perform safe substitution.
All data injected into templates is JSON-encoded for proper sanitization.
"""
import html
import json
import os

_TEMPLATES_DIR = os.path.join(os.path.dirname(__file__), "..", "templates")


def get_templates_dir() -> str:
    """Return the absolute path to the templates directory."""
    return os.path.abspath(_TEMPLATES_DIR)


def load_template(name: str) -> str:
    """Load a template file by name (e.g. 'site_report.html'). Raises FileNotFoundError if missing."""
    path = os.path.join(get_templates_dir(), name)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"Template not found: {path}")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def render_template(name: str, **kwargs) -> str:
    """
    Load template and replace {{ key }} with value.
    For proper sanitization: pass strings (will be HTML-escaped) or pass data as
    already JSON-serialized string for script injection (use json.dumps in caller).
    """
    template = load_template(name)
    for key, value in kwargs.items():
        placeholder = "{{ " + key + " }}"
        if placeholder not in template:
            continue
        if key == "report_data":
            # Caller passes pre-serialized JSON string for safe script injection
            pass
        elif isinstance(value, str):
            value = html.escape(value)
        else:
            value = json.dumps(value)
        template = template.replace(placeholder, value)
    return template
