#!/usr/bin/env bash
# Builds the Graphify code graph (graphify-out/graph.json) for a cloud session.
# Called in the background by cloud-session-setup.sh, so the session never waits.
# Code only: tree-sitter parses TS, Python and SQL locally, no LLM, no API key,
# nothing leaves the container. The graph is not committed (.gitignore).
# Log: ${TMPDIR:-/tmp}/graphify-setup.log. How agents use it: CLAUDE.md, "Code graph".

set -u
root="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
version="0.9.93"

venv="$HOME/.cache/graphify-venv"
if ! graphify --version 2>/dev/null | grep -q "$version"; then
  # pip in a plain venv: `uv tool install` took minutes here, pip takes seconds.
  python3 -m venv "$venv" &&
    "$venv/bin/pip" install --quiet --disable-pip-version-check "graphifyy[sql]==$version" &&
    mkdir -p "$HOME/.local/bin" &&
    ln -sf "$venv/bin/graphify" "$HOME/.local/bin/graphify" || exit 1
fi

cd "$root" || exit 1
graphify extract . --code-only || exit 1

# Rebuild after commit, checkout, merge and rebase (incremental, in the background).
had_attributes=$(git ls-files --error-unmatch .gitattributes >/dev/null 2>&1 && echo 1)
graphify hook install
# The hook also registers a merge driver for a committed graph.json; ours is ignored,
# so drop the .gitattributes it creates rather than leave an untracked file around.
[ -z "$had_attributes" ] && rm -f .gitattributes
exit 0
