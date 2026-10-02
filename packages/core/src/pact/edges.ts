import { type AnswerSheet, IMPORTANCE_WEIGHTS, MIN_COMMON_QUESTIONS } from "../matching/compatibility";
import { canSee } from "../policies/can-see";
import type { Member, Mode, PolicyContext } from "../policies/types";
import { PACT_RULES } from "./rules";

/**
 * Graph of the Pact (docs/06-matching.md, section 9): one edge per eligible
 * pair, mode and compatibility above the threshold. The Python solver then
 * finds the maximum weight matching of each mode's graph.
 */
export interface PactParticipant {
  readonly member: Member;
  /** Modes the member joined the Pact for (a subset of their profile's modes). */
  readonly modes: readonly Mode[];
  readonly answers: AnswerSheet;
}

export interface PactEdge {
  readonly mode: Mode;
  /** `a < b`, as in the database's ordered pairs. */
  readonly a: string;
  readonly b: string;
  readonly score: number;
}

/**
 * Modes in which the Pact may pair two participants. Same rules as discovery
 * (`canSee`, both ways), with one difference: joining the Pact is consent to
 * be shown to one's Pact match, so incognito is lifted for the pair. Pairs
 * already matched are left out. Dealbreakers are checked with the
 * compatibility (`fastCompatibility`); this function is also used at reveal
 * time, when only the policies need checking again.
 */
export function pactEligibleModes(
  a: Pick<PactParticipant, "member" | "modes">,
  b: Pick<PactParticipant, "member" | "modes">,
  context: PolicyContext,
): Mode[] {
  const memberA = a.member.incognito ? { ...a.member, incognito: false } : a.member;
  const memberB = b.member.incognito ? { ...b.member, incognito: false } : b.member;
  const forward = canSee(memberA, memberB, context);
  const backward = canSee(memberB, memberA, context);
  if (!forward.visible || !backward.visible) {
    return [];
  }
  if (context.relations.hasActiveMatch(memberA.id, memberB.id)) {
    return [];
  }
  return forward.modes.filter((mode) => a.modes.includes(mode) && b.modes.includes(mode));
}

/**
 * Answer sheets compiled to typed arrays over a shared question index: the
 * Pact compares every pair of participants (4.5 million pairs for 3,000
 * people), so compatibility must not allocate. Gives exactly the same results
 * as `compatibility` and `violatesDealbreaker` (property-tested).
 */
export interface CompiledSheet {
  /** Option index of the member's answer per question, -1 when unanswered. */
  readonly answers: Int16Array;
  /** Bit mask of the option indexes the member accepts. */
  readonly acceptable: Uint32Array;
  readonly weights: Uint16Array;
}

/** Bit masks hold 31 options per question; catalogue questions have 2 to 6. */
const MAX_OPTIONS = 31;

export function compileSheets(sheets: readonly AnswerSheet[]): CompiledSheet[] {
  const questionIndex = new Map<string, number>();
  const optionIndex = new Map<string, Map<string, number>>();
  const indexOf = (questionId: string, option: string) => {
    let options = optionIndex.get(questionId);
    if (!options) {
      options = new Map();
      optionIndex.set(questionId, options);
    }
    let position = options.get(option);
    if (position === undefined) {
      position = options.size;
      if (position >= MAX_OPTIONS) {
        throw new Error(`A question has more than ${MAX_OPTIONS} options.`);
      }
      options.set(option, position);
    }
    return position;
  };
  for (const sheet of sheets) {
    for (const questionId of sheet.keys()) {
      if (!questionIndex.has(questionId)) {
        questionIndex.set(questionId, questionIndex.size);
      }
    }
  }
  const size = questionIndex.size;
  return sheets.map((sheet) => {
    const answers = new Int16Array(size).fill(-1);
    const acceptable = new Uint32Array(size);
    const weights = new Uint16Array(size);
    for (const [questionId, answer] of sheet) {
      const q = questionIndex.get(questionId) as number;
      answers[q] = indexOf(questionId, answer.answer);
      let mask = 0;
      for (const option of answer.acceptable) {
        mask |= 1 << indexOf(questionId, option);
      }
      acceptable[q] = mask >>> 0;
      weights[q] = IMPORTANCE_WEIGHTS[answer.importance];
    }
    return { answers, acceptable, weights };
  });
}

const MANDATORY = IMPORTANCE_WEIGHTS.mandatory;

export interface FastCompatibility {
  /** `null` below the minimum number of common questions, like `compatibility`. */
  readonly score: number | null;
  readonly commonQuestions: number;
  readonly dealbreaker: boolean;
}

export function fastCompatibility(
  a: CompiledSheet,
  b: CompiledSheet,
  minCommonQuestions: number = MIN_COMMON_QUESTIONS,
): FastCompatibility {
  let common = 0;
  let earnedA = 0;
  let possibleA = 0;
  let earnedB = 0;
  let possibleB = 0;
  let dealbreaker = false;
  const size = a.answers.length;
  for (let q = 0; q < size; q++) {
    const answerA = a.answers[q] as number;
    const answerB = b.answers[q] as number;
    if (answerA < 0 || answerB < 0) {
      continue;
    }
    common++;
    const weightA = a.weights[q] as number;
    const weightB = b.weights[q] as number;
    const aAccepts = (((a.acceptable[q] as number) >>> answerB) & 1) === 1;
    const bAccepts = (((b.acceptable[q] as number) >>> answerA) & 1) === 1;
    possibleA += weightA;
    possibleB += weightB;
    if (aAccepts) {
      earnedA += weightA;
    } else if (weightA === MANDATORY) {
      dealbreaker = true;
    }
    if (bAccepts) {
      earnedB += weightB;
    } else if (weightB === MANDATORY) {
      dealbreaker = true;
    }
  }
  if (common === 0 || common < minCommonQuestions) {
    return { score: null, commonQuestions: common, dealbreaker };
  }
  const satisfactionA = possibleA === 0 ? 1 : earnedA / possibleA;
  const satisfactionB = possibleB === 0 ? 1 : earnedB / possibleB;
  const score = Math.max(0, Math.sqrt(satisfactionA * satisfactionB) - 1 / common);
  return { score, commonQuestions: common, dealbreaker };
}

export interface PactGraphOptions {
  readonly threshold?: number;
  readonly neighbours?: number;
  readonly minCommonQuestions?: number;
}

/**
 * Every edge of the Pact's graphs, already sparsified (each participant keeps
 * their `neighbours` best edges per mode, see `BestNeighbours`): the payload
 * sent to the solver stays linear in the number of participants. The cheap
 * compatibility test runs first; the access policies only for pairs above
 * the threshold.
 */
export function buildPactEdges(
  participants: readonly PactParticipant[],
  context: PolicyContext,
  options: PactGraphOptions = {},
): PactEdge[] {
  const threshold = options.threshold ?? PACT_RULES.defaultThreshold;
  const neighbours = options.neighbours ?? PACT_RULES.neighbours;
  const compiled = compileSheets(participants.map((p) => p.answers));
  const best = new Map<Mode, BestNeighbours>();
  for (let i = 0; i < participants.length; i++) {
    const a = participants[i] as PactParticipant;
    for (let j = i + 1; j < participants.length; j++) {
      const b = participants[j] as PactParticipant;
      if (!a.modes.some((mode) => b.modes.includes(mode))) {
        continue;
      }
      const result = fastCompatibility(
        compiled[i] as CompiledSheet,
        compiled[j] as CompiledSheet,
        options.minCommonQuestions,
      );
      if (result.score === null || result.score < threshold || result.dealbreaker) {
        continue;
      }
      for (const mode of pactEligibleModes(a, b, context)) {
        let graph = best.get(mode);
        if (!graph) {
          graph = new BestNeighbours(neighbours);
          best.set(mode, graph);
        }
        graph.offer(a.member.id, b.member.id, result.score);
      }
    }
  }
  return [...best].flatMap(([mode, graph]) => graph.edges().map((edge) => ({ mode, ...edge })));
}

interface Candidate {
  readonly other: string;
  readonly score: number;
}

/** True when `x` is a worse neighbour than `y`: lower score, or same score and greater id. */
const worse = (x: Candidate, y: Candidate) => x.score < y.score || (x.score === y.score && x.other > y.other);

/**
 * Sparsification without storing the whole graph: each member keeps a heap
 * of their `k` best edges, and an edge survives when it is in the heap of at
 * least one of its ends. Ties are broken by the other member's id, as in the
 * Python solver, so the solver's own sparsification changes nothing.
 */
export class BestNeighbours {
  private readonly heaps = new Map<string, Candidate[]>();

  constructor(private readonly k: number) {}

  offer(a: string, b: string, score: number) {
    this.push(a, { other: b, score });
    this.push(b, { other: a, score });
  }

  edges(): { a: string; b: string; score: number }[] {
    const kept = new Map<string, { a: string; b: string; score: number }>();
    for (const [member, heap] of this.heaps) {
      for (const { other, score } of heap) {
        const [a, b] = member < other ? [member, other] : [other, member];
        kept.set(`${a}|${b}`, { a, b, score });
      }
    }
    return [...kept.values()].sort((x, y) => (x.a === y.a ? (x.b < y.b ? -1 : 1) : x.a < y.a ? -1 : 1));
  }

  private push(member: string, candidate: Candidate) {
    let heap = this.heaps.get(member);
    if (!heap) {
      heap = [];
      this.heaps.set(member, heap);
    }
    // Min-heap on "worse": the root is the weakest of the kept edges.
    if (heap.length < this.k) {
      heap.push(candidate);
      siftUp(heap, heap.length - 1);
    } else if (worse(heap[0] as Candidate, candidate)) {
      heap[0] = candidate;
      siftDown(heap, 0);
    }
  }
}

function siftUp(heap: Candidate[], start: number) {
  let child = start;
  while (child > 0) {
    const parent = (child - 1) >> 1;
    if (!worse(heap[child] as Candidate, heap[parent] as Candidate)) {
      return;
    }
    [heap[child], heap[parent]] = [heap[parent] as Candidate, heap[child] as Candidate];
    child = parent;
  }
}

function siftDown(heap: Candidate[], start: number) {
  let parent = start;
  for (;;) {
    const left = 2 * parent + 1;
    const right = left + 1;
    let smallest = parent;
    if (left < heap.length && worse(heap[left] as Candidate, heap[smallest] as Candidate)) {
      smallest = left;
    }
    if (right < heap.length && worse(heap[right] as Candidate, heap[smallest] as Candidate)) {
      smallest = right;
    }
    if (smallest === parent) {
      return;
    }
    [heap[parent], heap[smallest]] = [heap[smallest] as Candidate, heap[parent] as Candidate];
    parent = smallest;
  }
}
