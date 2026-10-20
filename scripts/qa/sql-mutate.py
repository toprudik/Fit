#!/usr/bin/env python3
"""Mutation check for SQL functions: does any pgTAP test notice when one line of a function is broken?

Usage, from the repo root with the local Supabase running (supabase start):

    scripts/qa/sql-mutate.py private.pick_pass "and pb.remaining > 0" "and pb.remaining >= 0" 978_qa_money_booking.test.sql

Takes the latest definition of the function from supabase/migrations, replaces the first <old> with <new>, runs
each test file with the broken function inside that test's transaction (the rollback at its end leaves the
database unchanged) and prints KILLED when a test fails or the file stops early on an error, SURVIVED when every test still passes.
Pass every test file (supabase/tests/*.test.sql) to see whether anything at all catches the change.
"""
import glob
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DB_URL = os.environ.get("DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")


def latest_definition(function: str) -> str:
    schema, name = function.split(".")
    pattern = re.compile(r"create\s+(?:or\s+replace\s+)?function\s+%s\.%s\s*\(" % (schema, name), re.I)
    found = None
    for path in sorted(glob.glob(os.path.join(ROOT, "supabase/migrations/*.sql"))):
        source = open(path).read()
        for match in pattern.finditer(source):
            found = (source, match.start())
    if not found:
        sys.exit(f"{function} is not defined in supabase/migrations")
    source, start = found
    tag = re.search(r"as\s+(\$[a-z_]*\$)", source[start:], re.I)
    end = source.index(tag.group(1), start + tag.end()) + len(tag.group(1))
    block = source[start : source.index(";", end) + 1]
    return re.sub(r"^create\s+(or\s+replace\s+)?function", "create or replace function", block, flags=re.I)


def main() -> None:
    if len(sys.argv) < 5:
        sys.exit(__doc__)
    function, old, new, tests = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4:]
    definition = latest_definition(function)
    if old not in definition:
        sys.exit(f"{old!r} is not in the latest definition of {function}")
    mutant = definition.replace(old, new, 1)
    helpers = os.path.join(ROOT, "supabase/tests/_helpers.psql")
    for test in tests:
        path = test if os.path.isabs(test) else os.path.join(ROOT, "supabase/tests", os.path.basename(test))
        body = open(path).read().replace("\\ir _helpers.psql", f"\\i {helpers}")
        body = body.replace("begin;", f"begin;\ncreate extension if not exists pgtap;\n{mutant}\n", 1)
        output = subprocess.run(
            ["psql", DB_URL, "-q", "-X", "-tA", "-f", "-"], input=body, capture_output=True, text=True
        ).stdout
        failed = len(re.findall(r"^\s*not ok", output, re.M))
        passed = len(re.findall(r"^\s*ok", output, re.M))
        plan = re.search(r"^\s*1\.\.(\d+)", output, re.M)
        # A file that stops on an error runs fewer tests than it planned: that counts as caught too.
        verdict = "KILLED" if failed or not plan or passed < int(plan.group(1)) else "SURVIVED"
        print(f"{os.path.basename(path)}: ok={passed} not_ok={failed} -> {verdict}")


if __name__ == "__main__":
    main()
