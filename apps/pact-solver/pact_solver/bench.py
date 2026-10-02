"""
Benchmark on synthetic members: ``pnpm --filter @epilove/pact-solver bench [-- --members 3000]``.

Each synthetic member has a hidden taste vector; the compatibility of a pair is a noisy function of
the similarity of their vectors, spread like real questionnaire scores (most pairs between 0.3 and
0.8). Every pair is a candidate (worst case: friends mode, where everyone can meet everyone), then
the usual threshold and sparsification apply. The full pipeline with real questionnaire scores is
measured by ``pnpm pact:compute --synthetic 3000`` (apps/worker).
"""

from __future__ import annotations

import argparse
import math
import random
import time

from pact_solver.solver import (
    Options,
    above_threshold,
    canonical_edges,
    cpsat_available,
    greedy_matching,
    match_cpsat,
    match_networkx,
    sparsify,
)


def synthetic_edges(members: int, seed: int, dimensions: int = 6) -> tuple[list[str], list[list]]:
    rng = random.Random(seed)
    ids = [f"m{position:05d}" for position in range(members)]
    vectors = []
    for _ in ids:
        vector = [rng.gauss(0, 1) for _ in range(dimensions)]
        norm = math.sqrt(sum(x * x for x in vector)) or 1.0
        vectors.append([x / norm for x in vector])
    edges = []
    for i in range(members):
        vi = vectors[i]
        for j in range(i + 1, members):
            cosine = sum(a * b for a, b in zip(vi, vectors[j], strict=True))
            score = min(1.0, max(0.0, 0.55 + 0.25 * cosine + rng.gauss(0, 0.08)))
            edges.append([ids[i], ids[j], round(score, 4)])
    return ids, edges


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--members", type=int, default=3000)
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--threshold", type=float, default=0.6)
    parser.add_argument("--neighbours", type=int, default=50)
    parser.add_argument("--time-limit", type=float, default=120.0)
    args = parser.parse_args()

    started = time.perf_counter()
    ids, raw = synthetic_edges(args.members, args.seed)
    index = {member: position for position, member in enumerate(ids)}
    edges = canonical_edges(raw, index)
    kept = above_threshold(edges, args.threshold)
    sparse = sparsify(kept, args.neighbours)
    print(f"members              {args.members}")
    print(f"candidate pairs      {len(edges)}")
    print(f"above threshold      {len(kept)} ({len(kept) / max(1, len(edges)):.1%})")
    print(f"after sparsification {len(sparse)} (top {args.neighbours} neighbours)")
    print(f"preparation          {time.perf_counter() - started:.1f} s")
    print()

    scores = {(edge.a, edge.b): edge.score for edge in sparse}
    options = Options(threshold=args.threshold, neighbours=args.neighbours)

    def report(name: str, pairs: list[tuple[int, int]], seconds: float, status: str = "") -> None:
        total = sum(scores[pair] for pair in pairs)
        minimum = min((scores[pair] for pair in pairs), default=0.0)
        print(
            f"{name:<10} {seconds:7.2f} s  pairs {len(pairs):5d}  coverage {2 * len(pairs) / len(ids):6.1%}"
            f"  total {total:9.2f}  min {minimum:.3f} {status}"
        )

    started = time.perf_counter()
    report("greedy", greedy_matching(sparse), time.perf_counter() - started)
    started = time.perf_counter()
    report("networkx", match_networkx(sparse, options.power), time.perf_counter() - started)
    if cpsat_available():
        started = time.perf_counter()
        pairs, status = match_cpsat(sparse, options.power, args.time_limit)
        report("cpsat", pairs, time.perf_counter() - started, status)
    else:
        print("cpsat      skipped (uv sync --extra cpsat)")


if __name__ == "__main__":
    main()
