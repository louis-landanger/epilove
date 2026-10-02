"""
Maximum weight matching of the Pact, one graph per mode (docs/06-matching.md, section 9).

Request (JSON on stdin, see ``__main__``)::

    {
      "threshold": 0.6,          # below this compatibility, no edge: better no match than a bad one
      "neighbours": 50,          # sparsification: each member keeps their 50 best edges
      "power": 1,                # edge weight = score ** power (2 favours excellent pairs)
      "engine": "auto",          # "networkx" (Edmonds' blossom), "cpsat" (OR-Tools) or "auto"
      "timeLimitSeconds": 300,   # CP-SAT only
      "distinctPairs": true,     # a pair matched in one graph is removed from the following ones
      "graphs": [{"mode": "love", "nodes": ["<id>", ...], "edges": [["<id>", "<id>", 0.72], ...]}]
    }

Response::

    {"graphs": [{"mode": "love", "pairs": [["<low id>", "<high id>", 0.72], ...], "stats": {...}}]}

Identifiers are opaque strings (member ids): the solver never sees a name, an answer or a preference.
Each member appears in at most one pair per graph; every pair is an edge of the input above the
threshold. Both properties are checked before answering.
"""

from __future__ import annotations

import heapq
import math
import statistics
import time
from collections import defaultdict
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import networkx as nx

ENGINES = ("auto", "networkx", "cpsat")

# Integer weights keep the blossom algorithm exact (networkx uses integer arithmetic for integer
# weights) and are what CP-SAT needs anyway. A micro-unit of compatibility is far below any
# meaningful difference.
WEIGHT_SCALE = 1_000_000

# "auto" uses networkx (exact, polynomial, predictable) and switches to CP-SAT only beyond this many
# edges, when OR-Tools is installed. With 50 neighbours, 3,000 members give at most 150k edges.
# Measured (README.md): networkx solves 3,000 members in 1 to 2.5 minutes; CP-SAT is faster on
# uniform synthetic weights (59 s against 141 s) but did not prove optimality within 5 minutes on
# questionnaire-shaped scores.
AUTO_CPSAT_EDGES = 250_000


class SolverError(ValueError):
    """Invalid request or solver failure. Messages never contain member ids."""


@dataclass(frozen=True, order=True)
class Edge:
    a: int
    b: int
    score: float


@dataclass(frozen=True)
class Options:
    threshold: float = 0.6
    neighbours: int = 50
    power: float = 1.0
    engine: str = "auto"
    time_limit_seconds: float = 300.0
    distinct_pairs: bool = True


def weight(score: float, power: float) -> int:
    """Integer weight of an edge: always positive, so every edge above the threshold is worth taking."""
    return max(1, round(score**power * WEIGHT_SCALE))


def canonical_edges(raw: Iterable[Sequence[Any]], index: Mapping[str, int]) -> list[Edge]:
    """Validates edges, drops self-loops and keeps the best score of duplicated pairs."""
    best: dict[tuple[int, int], float] = {}
    for item in raw:
        if not isinstance(item, Sequence) or isinstance(item, str) or len(item) != 3:
            raise SolverError("each edge must be [id, id, score]")
        a, b, score = item
        if not isinstance(a, str) or not isinstance(b, str):
            raise SolverError("edge ends must be string ids")
        if isinstance(score, bool) or not isinstance(score, int | float) or not math.isfinite(score):
            raise SolverError("edge scores must be finite numbers")
        if not 0 <= score <= 1:
            raise SolverError("edge scores must be between 0 and 1")
        if a == b:
            continue
        i, j = sorted((index[a], index[b]))
        if score > best.get((i, j), -1.0):
            best[(i, j)] = float(score)
    return [Edge(i, j, s) for (i, j), s in sorted(best.items())]


def above_threshold(edges: Iterable[Edge], threshold: float) -> list[Edge]:
    return [edge for edge in edges if edge.score >= threshold]


def sparsify(edges: Sequence[Edge], neighbours: int) -> list[Edge]:
    """
    Keeps an edge when it is among the ``neighbours`` best edges of at least one of its ends.
    Nobody loses their best options, and the graph stays linear in the number of members.
    Ties are broken by the other end's index, so the result is deterministic.
    """
    incident: dict[int, list[tuple[float, int, int]]] = defaultdict(list)
    for position, edge in enumerate(edges):
        incident[edge.a].append((-edge.score, edge.b, position))
        incident[edge.b].append((-edge.score, edge.a, position))
    kept: set[int] = set()
    for items in incident.values():
        kept.update(position for _, _, position in heapq.nsmallest(neighbours, items))
    return [edges[position] for position in sorted(kept)]


def greedy_matching(edges: Sequence[Edge]) -> list[tuple[int, int]]:
    """Best edge first. A 1/2-approximation, used as a CP-SAT hint and in the benchmark."""
    taken: set[int] = set()
    pairs: list[tuple[int, int]] = []
    for edge in sorted(edges, key=lambda e: (-e.score, e.a, e.b)):
        if edge.a not in taken and edge.b not in taken:
            taken.update((edge.a, edge.b))
            pairs.append((edge.a, edge.b))
    return sorted(pairs)


def match_networkx(edges: Sequence[Edge], power: float) -> list[tuple[int, int]]:
    """Edmonds' blossom algorithm on a general graph (orientations are diverse: not bipartite)."""
    graph = nx.Graph()
    graph.add_weighted_edges_from((edge.a, edge.b, weight(edge.score, power)) for edge in edges)
    matching = nx.max_weight_matching(graph, maxcardinality=False)
    return sorted((min(a, b), max(a, b)) for a, b in matching)


def match_cpsat(
    edges: Sequence[Edge], power: float, time_limit_seconds: float
) -> tuple[list[tuple[int, int]], str]:
    """Integer program: one boolean per edge, at most one chosen edge per member."""
    try:
        from ortools.sat.python import cp_model
    except ImportError as error:  # pragma: no cover - depends on the optional extra
        raise SolverError("OR-Tools is not installed: run `uv sync --extra cpsat`") from error

    model = cp_model.CpModel()
    chosen = [model.new_bool_var(f"e{position}") for position in range(len(edges))]
    incident: dict[int, list[Any]] = defaultdict(list)
    for variable, edge in zip(chosen, edges, strict=True):
        incident[edge.a].append(variable)
        incident[edge.b].append(variable)
    for variables in incident.values():
        if len(variables) > 1:
            model.add_at_most_one(variables)
    model.maximize(cp_model.LinearExpr.weighted_sum(chosen, [weight(e.score, power) for e in edges]))

    hint = set(greedy_matching(edges))
    for variable, edge in zip(chosen, edges, strict=True):
        model.add_hint(variable, (edge.a, edge.b) in hint)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_seconds
    solver.parameters.num_workers = 8
    solver.parameters.random_seed = 0
    status = solver.solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise SolverError(f"CP-SAT found no solution ({solver.status_name(status)})")
    chosen_edges = zip(chosen, edges, strict=True)
    pairs = sorted((edge.a, edge.b) for variable, edge in chosen_edges if solver.boolean_value(variable))
    return pairs, "optimal" if status == cp_model.OPTIMAL else "feasible"


def cpsat_available() -> bool:
    try:
        import ortools.sat.python.cp_model  # noqa: F401
    except ImportError:
        return False
    return True


def verify_matching(pairs: Sequence[tuple[int, int]], edges: Sequence[Edge]) -> None:
    """Each member at most once, and only edges of the graph. Never trust a solver blindly."""
    known = {(edge.a, edge.b) for edge in edges}
    seen: set[int] = set()
    for a, b in pairs:
        if (a, b) not in known:
            raise SolverError("the solver returned a pair that is not an edge")
        if a in seen or b in seen:
            raise SolverError("the solver matched a member twice")
        seen.update((a, b))


def histogram(scores: Sequence[float], threshold: float) -> list[dict[str, float | int]]:
    """Counts per 0.05 band, from the threshold's band up to 1."""
    start = math.floor(threshold * 20) / 20
    bands: list[dict[str, float | int]] = []
    low = start
    while low < 1 - 1e-9:
        high = round(low + 0.05, 2)
        last = high >= 1 - 1e-9
        count = sum(1 for s in scores if low <= s < high or (last and s == 1))
        bands.append({"from": round(low, 2), "to": high, "count": count})
        low = high
    return bands


def solve_graph(
    mode: str,
    nodes: Iterable[str],
    raw_edges: Iterable[Sequence[Any]],
    options: Options,
    excluded: frozenset[frozenset[str]] = frozenset(),
) -> dict[str, Any]:
    started = time.perf_counter()
    raw_edges = list(raw_edges)
    ends = {end for edge in raw_edges if isinstance(edge, list | tuple) for end in edge[:2]}
    ids = sorted(set(nodes) | {end for end in ends if isinstance(end, str)})
    index = {member: position for position, member in enumerate(ids)}

    edges = canonical_edges(raw_edges, index)
    if excluded:
        edges = [edge for edge in edges if frozenset((ids[edge.a], ids[edge.b])) not in excluded]
    kept = above_threshold(edges, options.threshold)
    sparse = sparsify(kept, options.neighbours)

    engine = options.engine
    if engine == "auto":
        engine = "cpsat" if len(sparse) > AUTO_CPSAT_EDGES and cpsat_available() else "networkx"
    if engine == "networkx":
        pairs, status = match_networkx(sparse, options.power), "optimal"
    else:
        pairs, status = match_cpsat(sparse, options.power, options.time_limit_seconds)
    verify_matching(pairs, sparse)

    scores_by_pair = {(edge.a, edge.b): edge.score for edge in sparse}
    result = [[ids[a], ids[b], scores_by_pair[(a, b)]] for a, b in pairs]
    scores = sorted(score for _, _, score in result)
    return {
        "mode": mode,
        "pairs": result,
        "stats": {
            "nodes": len(ids),
            "edgesIn": len(edges),
            "edgesAboveThreshold": len(kept),
            "edgesKept": len(sparse),
            "pairs": len(result),
            "matchedNodes": 2 * len(result),
            "coverage": round(2 * len(result) / len(ids), 4) if ids else 0.0,
            "scoreMin": scores[0] if scores else None,
            "scoreMedian": statistics.median(scores) if scores else None,
            "scoreMean": round(statistics.fmean(scores), 4) if scores else None,
            "scoreMax": scores[-1] if scores else None,
            "histogram": histogram(scores, options.threshold),
            "engine": engine,
            "status": status,
            "seconds": round(time.perf_counter() - started, 3),
        },
    }


def parse_options(request: Mapping[str, Any]) -> Options:
    threshold = request.get("threshold", 0.6)
    neighbours = request.get("neighbours", 50)
    power = request.get("power", 1)
    engine = request.get("engine", "auto")
    time_limit = request.get("timeLimitSeconds", 300)
    distinct = request.get("distinctPairs", True)
    if isinstance(threshold, bool) or not isinstance(threshold, int | float) or not 0 <= threshold <= 1:
        raise SolverError("threshold must be between 0 and 1")
    if isinstance(neighbours, bool) or not isinstance(neighbours, int) or neighbours < 1:
        raise SolverError("neighbours must be a positive integer")
    if isinstance(power, bool) or not isinstance(power, int | float) or not 0 < power <= 4:
        raise SolverError("power must be in ]0, 4]")
    if engine not in ENGINES:
        raise SolverError(f"engine must be one of {', '.join(ENGINES)}")
    if isinstance(time_limit, bool) or not isinstance(time_limit, int | float) or time_limit <= 0:
        raise SolverError("timeLimitSeconds must be positive")
    if not isinstance(distinct, bool):
        raise SolverError("distinctPairs must be a boolean")
    return Options(float(threshold), neighbours, float(power), engine, float(time_limit), distinct)


def solve(request: Mapping[str, Any]) -> dict[str, Any]:
    """Solves every graph of the request, in order (see the module docstring)."""
    if not isinstance(request, Mapping):
        raise SolverError("the request must be a JSON object")
    options = parse_options(request)
    graphs = request.get("graphs")
    if not isinstance(graphs, list):
        raise SolverError("graphs must be a list")
    modes = [graph.get("mode") if isinstance(graph, Mapping) else None for graph in graphs]
    if any(not isinstance(mode, str) for mode in modes) or len(set(modes)) != len(modes):
        raise SolverError("each graph needs a distinct mode")

    matched: set[frozenset[str]] = set()
    results = []
    for graph in graphs:
        nodes = graph.get("nodes", [])
        edges = graph.get("edges", [])
        if not isinstance(nodes, list) or not all(isinstance(node, str) for node in nodes):
            raise SolverError("nodes must be a list of string ids")
        if not isinstance(edges, list):
            raise SolverError("edges must be a list")
        # The app has one match per pair of members: with distinctPairs, a pair already matched in
        # an earlier graph (love) is not matched again in a later one (friends).
        excluded = frozenset(matched) if options.distinct_pairs else frozenset()
        result = solve_graph(graph["mode"], nodes, edges, options, excluded)
        matched.update(frozenset(pair[:2]) for pair in result["pairs"])
        results.append(result)
    return {"graphs": results}
