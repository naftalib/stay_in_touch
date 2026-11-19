#!/usr/bin/env python3
"""Print the shared-pooler hostname from a Management API pooler config.

The API returns one object or a list. Session mode and transaction mode share
a host; the shell forces port 5432. connection_string is never written: it
embeds a password placeholder.
"""

from __future__ import annotations

import json
import sys


def rows_from(data: object) -> list[dict[str, object]]:
    if isinstance(data, dict):
        return [data]
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    return []


def main() -> int:
    if len(sys.argv) != 2:
        sys.stderr.write("pooler config path is required\n")
        return 1
    try:
        with open(sys.argv[1], encoding="utf-8") as handle:
            data = json.load(handle)
    except (OSError, json.JSONDecodeError):
        sys.stderr.write("pooler config was not valid json\n")
        return 1

    rows = rows_from(data)
    typed = [row for row in rows if row.get("database_type")]
    primary = (
        [row for row in typed if row.get("database_type") == "PRIMARY"]
        if typed
        else rows
    )
    if not primary:
        sys.stderr.write("pooler config had no primary database\n")
        return 1

    session = [row for row in primary if row.get("pool_mode") == "session"]
    chosen = session[0] if session else primary[0]
    host = chosen.get("db_host")
    if not isinstance(host, str) or not host.strip():
        sys.stderr.write("pooler config had no db_host\n")
        return 1
    sys.stdout.write(host.strip().lower())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
