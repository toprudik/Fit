import importlib.util
import inspect
import json
import re
import tomllib
from pathlib import Path

import fit_bot.asgi

ROOT = Path(__file__).resolve().parents[1]


def test_vercel_json() -> None:
    config = json.loads((ROOT / "vercel.json").read_text())
    assert config["framework"] == "python"
    assert "ignoreCommand" not in config
    assert "regions" not in config
    for path, function in config["functions"].items():
        assert (ROOT / path).is_file(), path
        assert function["maxDuration"] <= 60


def test_python_version() -> None:
    assert (ROOT / ".python-version").read_text() == "3.13\n"


def test_pyproject() -> None:
    pyproject = tomllib.loads((ROOT / "pyproject.toml").read_text())
    assert pyproject["tool"]["vercel"]["entrypoint"] == "api.index:app"
    assert (ROOT / "api" / "index.py").is_file()
    for requirement in pyproject["build-system"]["requires"]:
        assert re.fullmatch(r"[A-Za-z0-9_.-]+==[0-9.]+", requirement), requirement
    assert pyproject["project"]["description"].startswith("DaFit")


def test_entrypoint_is_the_asgi_app_vercel_detects() -> None:
    spec = importlib.util.spec_from_file_location("vercel_entry", ROOT / "api" / "index.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = module.app
    assert app is fit_bot.asgi.app
    # vercel_runtime.resolver.detect_app_type: a coroutine __call__ with exactly three required positional parameters.
    assert inspect.iscoroutinefunction(app.__call__)
    required = [
        p
        for p in inspect.signature(app).parameters.values()
        if p.default is inspect.Parameter.empty
        and p.kind in (inspect.Parameter.POSITIONAL_ONLY, inspect.Parameter.POSITIONAL_OR_KEYWORD)
    ]
    assert len(required) == 3
    assert len(inspect.signature(app.__call__).parameters) == 3
