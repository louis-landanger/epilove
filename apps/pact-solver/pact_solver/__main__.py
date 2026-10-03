"""
Command line entry point: ``python -m pact_solver < request.json > response.json``.

Reads one request on stdin and writes one response on stdout (see ``solver``). Exit code 2 on an
invalid request, with a short message on stderr that never contains member ids.
"""

from __future__ import annotations

import json
import sys

from pact_solver.solver import SolverError, solve


def main() -> int:
    try:
        request = json.load(sys.stdin)
    except json.JSONDecodeError:
        print("pact-solver: the request is not valid JSON", file=sys.stderr)
        return 2
    try:
        response = solve(request)
    except SolverError as error:
        print(f"pact-solver: {error}", file=sys.stderr)
        return 2
    json.dump(response, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
