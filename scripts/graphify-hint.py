#!/usr/bin/env python3
"""PreToolUse hook: reminds an agent once that the Graphify code graph exists.

Fires on the first code search (Grep, Glob, or a Bash grep/rg/find) of each agent
in a session, only when graphify-out/graph.json is built. One short note per
agent instead of a nudge on every call keeps the reminder cheaper than what it saves.
"""

import json
import os
import re
import sys
import tempfile
from pathlib import Path

HINT = (
    "Code graph is built (graphify-out/graph.json). Before grepping for callers, "
    "usages or impact, ask it: `graphify affected \"name()\"` (who calls / what breaks), "
    "`graphify explain \"name()\"` (definition, imports, callers), "
    "`graphify query \"identifiers\" --budget 800` (orientation). "
    "Plain grep stays fine for exact strings such as dictionary keys or copy. "
    "See CLAUDE.md, \"Code graph\"."
)
SEARCH = re.compile(r"(^|[\s|;&(])(grep|rg|find|git\s+grep)\s")


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except ValueError:
        return
    root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or payload.get("cwd") or ".")
    if not (root / "graphify-out" / "graph.json").is_file():
        return
    tool = payload.get("tool_name")
    command = str((payload.get("tool_input") or {}).get("command") or "")
    if tool == "Bash" and (not SEARCH.search(command) or "graphify" in command):
        return
    key = f"{payload.get('session_id', '')}-{payload.get('agent_id', 'main')}"
    marker = Path(tempfile.gettempdir()) / "graphify-hint" / re.sub(r"[^\w-]", "_", key)
    try:
        marker.parent.mkdir(exist_ok=True)
        marker.touch(exist_ok=False)
    except OSError:
        return
    output = {"hookSpecificOutput": {"hookEventName": "PreToolUse", "additionalContext": HINT}}
    print(json.dumps(output))


if __name__ == "__main__":
    main()
