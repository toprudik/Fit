"""Architecture rules of the bot (CLAUDE.md "apps/bot", ADR 0006), checked on the source.

The bot stays thin: it answers commands and opens the Mini App. Data and notifications belong to apps/web and the
database, settings come through config.py, and every text a person reads lives in texts.py.
"""

import ast
import re
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent.parent / "src" / "fit_bot"
MODULES = sorted(PACKAGE.rglob("*.py"))

#: Packages that would let the bot hold data or business logic of its own.
DATA_ACCESS = {"supabase", "postgrest", "psycopg", "psycopg2", "asyncpg", "sqlalchemy", "redis"}
CYRILLIC = re.compile("[А-Яа-яЁё]")


def tree(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def name(path: Path) -> str:
    return path.relative_to(PACKAGE).as_posix()


def imported(module: ast.Module) -> set[str]:
    out: set[str] = set()
    for node in ast.walk(module):
        if isinstance(node, ast.Import):
            out.update(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            out.add(node.module)
    return out


def docstrings(module: ast.Module) -> set[int]:
    """ids of the string constants that are docstrings: they explain code and may cite the PRD in Russian."""
    out: set[int] = set()
    for node in ast.walk(module):
        if isinstance(node, ast.Module | ast.ClassDef | ast.FunctionDef | ast.AsyncFunctionDef) and node.body:
            first = node.body[0]
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant):
                out.add(id(first.value))
    return out


def test_the_bot_has_no_database_access_of_its_own():
    problems = [
        f"{name(path)}: {module}"
        for path in MODULES
        for module in imported(tree(path))
        if module.split(".")[0] in DATA_ACCESS
    ]
    assert problems == []


def test_environment_is_read_only_in_config():
    problems = []
    for path in MODULES:
        if name(path) == "config.py":
            continue
        for node in ast.walk(tree(path)):
            reads_environ = isinstance(node, ast.Attribute) and node.attr in {"environ", "getenv", "environb"}
            if reads_environ and isinstance(node.value, ast.Name) and node.value.id == "os":
                problems.append(f"{name(path)}:{node.lineno}")
    assert problems == []


def test_texts_a_person_reads_live_in_texts_py():
    # Russian string literals anywhere else are texts that skipped the catalog (and its English twin).
    problems = []
    for path in MODULES:
        if name(path) == "texts.py":
            continue
        module = tree(path)
        skip = docstrings(module)
        for node in ast.walk(module):
            is_text = isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in skip
            if is_text and CYRILLIC.search(node.value):
                problems.append(f"{name(path)}:{node.lineno}")
    assert problems == []


def test_handlers_depend_only_on_settings_texts_and_keyboards():
    # Handlers are the edge that talks to Telegram; the webhook, server and setup code must not leak into them.
    allowed = {"fit_bot.config", "fit_bot.texts", "fit_bot.keyboards"}
    problems = [
        f"{name(path)}: {module}"
        for path in sorted((PACKAGE / "handlers").glob("*.py"))
        for module in imported(tree(path))
        if module.startswith("fit_bot") and module not in allowed
    ]
    assert problems == []
