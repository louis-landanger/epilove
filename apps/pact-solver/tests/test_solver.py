from __future__ import annotations

import json
import random
import subprocess
import sys
from functools import cache

import pytest

from pact_solver.solver import (
    Edge,
    SolverError,
    canonical_edges,
    cpsat_available,
    greedy_matching,
    match_cpsat,
    match_networkx,
    solve,
    sparsify,
    weight,
)


def request(edges, *, nodes=None, mode="love", **options):
    graph = {"mode": mode, "edges": edges}
    if nodes is not None:
        graph["nodes"] = nodes
    return {"graphs": [graph], **options}


def pairs_of(response, position=0):
    return [tuple(pair[:2]) for pair in response["graphs"][position]["pairs"]]


def test_prefers_two_good_pairs_to_one_excellent_pair():
    edges = [["a", "b", 0.7], ["b", "c", 0.9], ["c", "d", 0.7]]
    assert pairs_of(solve(request(edges))) == [("a", "b"), ("c", "d")]


def test_squared_weights_favour_excellent_pairs():
    edges = [["a", "b", 0.6], ["b", "c", 0.95], ["c", "d", 0.6]]
    assert pairs_of(solve(request(edges, power=2))) == [("b", "c")]


def test_handles_odd_cycles_where_greedy_fails():
    # Triangle a-b-c plus a pendant d on a: the blossom algorithm finds b-c + a-d.
    edges = [["a", "b", 0.8], ["b", "c", 0.8], ["a", "c", 0.8], ["a", "d", 0.7]]
    assert pairs_of(solve(request(edges))) == [("a", "d"), ("b", "c")]
    index = {member: position for position, member in enumerate("abcd")}
    assert len(greedy_matching(canonical_edges(edges, index))) == 1


def test_better_no_match_than_a_bad_one():
    response = solve(request([["a", "b", 0.59], ["c", "d", 0.6]], threshold=0.6))
    assert pairs_of(response) == [("c", "d")]
    stats = response["graphs"][0]["stats"]
    assert stats["edgesIn"] == 2
    assert stats["edgesAboveThreshold"] == 1


def test_counts_isolated_participants_in_coverage():
    response = solve(request([["a", "b", 0.8]], nodes=["a", "b", "c", "d"]))
    stats = response["graphs"][0]["stats"]
    assert stats["nodes"] == 4
    assert stats["coverage"] == 0.5


def test_duplicated_pairs_keep_their_best_score_and_self_loops_are_ignored():
    response = solve(request([["a", "b", 0.7], ["b", "a", 0.8], ["c", "c", 0.9]]))
    assert response["graphs"][0]["pairs"] == [["a", "b", 0.8]]


def test_pairs_are_ordered_and_carry_their_score():
    response = solve(request([["z", "y", 0.75]]))
    assert response["graphs"][0]["pairs"] == [["y", "z", 0.75]]


def test_a_pair_matched_in_love_is_not_matched_again_in_friends():
    love = [["a", "b", 0.9]]
    friends = [["a", "b", 0.9], ["a", "c", 0.65]]
    graphs = [{"mode": "love", "edges": love}, {"mode": "friends", "edges": friends}]
    response = solve({"graphs": graphs})
    assert pairs_of(response, 0) == [("a", "b")]
    assert pairs_of(response, 1) == [("a", "c")]
    assert pairs_of(solve({"graphs": graphs, "distinctPairs": False}), 1) == [("a", "b")]


def test_sparsification_keeps_the_best_neighbours_of_each_end():
    # A star: the centre keeps its 3 best edges, but each leaf keeps its only edge.
    star = [Edge(0, leaf, 0.6 + leaf / 100) for leaf in range(1, 11)]
    assert len(sparsify(star, 3)) == 10

    # A complete graph: an edge survives only if one of its ends ranks it in its top k.
    rng = random.Random(3)
    complete = [Edge(i, j, round(rng.uniform(0.6, 1), 3)) for i in range(12) for j in range(i + 1, 12)]
    kept = set(sparsify(complete, 3))
    for edge in complete:

        def rank(node, edge=edge):
            incident = sorted(
                (e for e in complete if node in (e.a, e.b)),
                key=lambda e: (-e.score, e.b if e.a == node else e.a),
            )
            return incident.index(edge)

        assert (edge in kept) == (rank(edge.a) < 3 or rank(edge.b) < 3)
    degrees = {node: sum(1 for e in kept if node in (e.a, e.b)) for node in range(12)}
    assert min(degrees.values()) >= 3


def brute_force_best(edges: list[Edge], power: float) -> int:
    """Maximum total weight over all matchings (small graphs only)."""
    nodes = sorted({end for edge in edges for end in (edge.a, edge.b)})
    adjacency = {node: [] for node in nodes}
    for edge in edges:
        w = weight(edge.score, power)
        adjacency[edge.a].append((edge.b, w))
        adjacency[edge.b].append((edge.a, w))

    @cache
    def best(free: frozenset[int]) -> int:
        if not free:
            return 0
        node = min(free)
        rest = free - {node}
        value = best(rest)
        for other, w in adjacency[node]:
            if other in rest:
                value = max(value, w + best(rest - {other}))
        return value

    return best(frozenset(nodes))


def random_graph(rng: random.Random) -> list[Edge]:
    size = rng.randint(2, 9)
    density = rng.uniform(0.2, 0.9)
    return [
        Edge(i, j, round(rng.uniform(0.6, 1), 3))
        for i in range(size)
        for j in range(i + 1, size)
        if rng.random() < density
    ]


def total(pairs, edges, power):
    scores = {(edge.a, edge.b): edge.score for edge in edges}
    return sum(weight(scores[pair], power) for pair in pairs)


def assert_is_matching(pairs, edges):
    known = {(edge.a, edge.b) for edge in edges}
    seen = set()
    for a, b in pairs:
        assert (a, b) in known
        assert a not in seen and b not in seen
        seen.update((a, b))


@pytest.mark.parametrize("seed", range(150))
def test_networkx_finds_the_optimum_on_random_graphs(seed):
    rng = random.Random(seed)
    edges = random_graph(rng)
    power = rng.choice([1.0, 2.0])
    pairs = match_networkx(edges, power)
    assert_is_matching(pairs, edges)
    assert total(pairs, edges, power) == brute_force_best(edges, power)


@pytest.mark.skipif(not cpsat_available(), reason="OR-Tools not installed (uv sync --extra cpsat)")
@pytest.mark.parametrize("seed", range(40))
def test_cpsat_finds_the_same_optimum(seed):
    rng = random.Random(1000 + seed)
    edges = random_graph(rng)
    pairs, status = match_cpsat(edges, 1.0, 10)
    assert status == "optimal"
    assert_is_matching(pairs, edges)
    assert total(pairs, edges, 1.0) == brute_force_best(edges, 1.0)


def test_engines_agree_on_a_larger_graph():
    rng = random.Random(42)
    ids = [f"m{i:03d}" for i in range(200)]
    edges = [[a, b, round(rng.uniform(0.3, 1), 3)] for a in ids for b in ids if a < b and rng.random() < 0.1]
    nx_response = solve(request(edges, nodes=ids, engine="networkx", neighbours=10))
    assert nx_response["graphs"][0]["stats"]["engine"] == "networkx"
    if cpsat_available():
        cp_response = solve(request(edges, nodes=ids, engine="cpsat", neighbours=10, timeLimitSeconds=30))
        nx_total = sum(pair[2] for pair in nx_response["graphs"][0]["pairs"])
        cp_total = sum(pair[2] for pair in cp_response["graphs"][0]["pairs"])
        assert cp_total == pytest.approx(nx_total, abs=1e-5)


def test_output_does_not_depend_on_the_input_order():
    rng = random.Random(9)
    ids = [f"m{i:02d}" for i in range(40)]
    edges = [[a, b, round(rng.uniform(0.5, 1), 2)] for a in ids for b in ids if a < b and rng.random() < 0.3]
    shuffled = [list(reversed(edge[:2])) + [edge[2]] for edge in edges]
    rng.shuffle(shuffled)
    first = solve(request(edges, neighbours=5))
    second = solve(request(shuffled, neighbours=5))
    assert first["graphs"][0]["pairs"] == second["graphs"][0]["pairs"]


def test_histogram_counts_every_pair():
    rng = random.Random(5)
    ids = [f"m{i:02d}" for i in range(60)]
    edges = [[a, b, round(rng.uniform(0.6, 1), 3)] for a in ids for b in ids if a < b and rng.random() < 0.2]
    edges.append(["x", "y", 1.0])
    graph = solve(request(edges))["graphs"][0]
    assert sum(band["count"] for band in graph["stats"]["histogram"]) == len(graph["pairs"])
    assert graph["stats"]["histogram"][0]["from"] == 0.6
    assert graph["stats"]["histogram"][-1]["to"] == 1.0


@pytest.mark.parametrize(
    "bad",
    [
        {},
        {"graphs": "nope"},
        {"graphs": [{"edges": []}]},
        {"graphs": [{"mode": "love"}, {"mode": "love"}]},
        request([["a", "b", 1.5]]),
        request([["a", "b", float("nan")]]),
        request([["a", "b"]]),
        request([["a", 3, 0.7]]),
        request([3]),
        request([], threshold=2),
        request([], neighbours=0),
        request([], power=0),
        request([], engine="quantum"),
        request([], timeLimitSeconds=0),
        request([], distinctPairs="yes"),
        {"graphs": [{"mode": "love", "nodes": [1], "edges": []}]},
    ],
)
def test_rejects_invalid_requests(bad):
    with pytest.raises(SolverError):
        solve(bad)


def run_cli(stdin: str):
    return subprocess.run(
        [sys.executable, "-m", "pact_solver"], input=stdin, capture_output=True, text=True, check=False
    )


def test_command_line_round_trip():
    edges = [["0198a3f0-0000-7000-8000-000000000001", "0198a3f0-0000-7000-8000-000000000002", 0.8]]
    result = run_cli(json.dumps(request(edges)))
    assert result.returncode == 0, result.stderr
    response = json.loads(result.stdout)
    assert response["graphs"][0]["pairs"] == [[*edges[0][:2], 0.8]]


def test_command_line_errors_never_echo_member_ids():
    member = "0198a3f0-0000-7000-8000-000000000001"
    result = run_cli(json.dumps(request([[member, "other", 7]])))
    assert result.returncode == 2
    assert member not in result.stderr
    assert run_cli("not json").returncode == 2
