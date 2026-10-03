import type { Mode } from "@epilove/core";
import { CLOSERS, EXCHANGES, LIKE_COMMENTS, OPENERS } from "./content";
import type { DevMember } from "./members";
import type { Random } from "./random";

/**
 * Simulated activity between development members: likes, passes, matches,
 * conversations, blocks and hidden contacts. Pure: the database writes live in seed.ts.
 */

export interface LikePlan {
  readonly actorId: string;
  readonly targetId: string;
  readonly kind: "like" | "superlike" | "pass";
  /** Liked content: a photo position or a prompt position, or none for a pass. */
  readonly content: { readonly type: "photo" | "prompt"; readonly position: number } | null;
  readonly comment: string | null;
  readonly hoursAgo: number;
}

export interface MessagePlan {
  readonly senderId: string;
  readonly text: string;
  readonly minutesAfterMatch: number;
}

export interface MatchPlan {
  readonly userA: string;
  readonly userB: string;
  readonly mode: Mode;
  readonly hoursAgo: number;
  readonly messages: readonly MessagePlan[];
  /** How many of the last messages each member has not read yet. */
  readonly unreadFor: ReadonlyMap<string, number>;
}

export interface ActivityPlan {
  readonly likes: readonly LikePlan[];
  readonly matches: readonly MatchPlan[];
  readonly blocks: readonly (readonly [string, string])[];
  /** [member who hides, member hidden by email]. */
  readonly hiddenContacts: readonly (readonly [string, string])[];
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The mode two members could match in, or null when they could not match at all. */
export function sharedMode(a: DevMember, b: DevMember): Mode | null {
  if (
    a.modes.includes("love") &&
    b.modes.includes("love") &&
    a.interestedIn.includes(b.gender) &&
    b.interestedIn.includes(a.gender)
  ) {
    return "love";
  }
  if (a.modes.includes("friends") && b.modes.includes("friends")) {
    return "friends";
  }
  return null;
}

const canTakePart = (member: DevMember) => member.status === "active" && member.photoCount > 0;

export function planActivity(random: Random, members: readonly DevMember[]): ActivityPlan {
  const byPersona = new Map(members.filter((m) => m.persona).map((m) => [m.persona as string, m]));
  const persona = (name: string) => {
    const member = byPersona.get(name);
    if (!member) {
      throw new Error(`Missing persona ${name}`);
    }
    return member;
  };
  const active = members.filter(canTakePart);
  const ordinary = active.filter((m) => !m.persona);

  const blocks: [string, string][] = [];
  const blocked = new Set<string>();
  for (let i = 0; i < 14; i++) {
    const [a, b] = random.sample(ordinary, 2);
    if (a && b && !blocked.has(pairKey(a.id, b.id))) {
      blocks.push([a.id, b.id]);
      blocked.add(pairKey(a.id, b.id));
    }
  }
  const hiddenContacts: [string, string][] = [];
  for (let i = 0; i < 10; i++) {
    const [a, b] = random.sample(ordinary, 2);
    if (a && b) {
      hiddenContacts.push([a.id, b.id]);
      blocked.add(pairKey(a.id, b.id));
    }
  }

  const likes = new Map<string, LikePlan>();
  const matches = new Map<string, MatchPlan>();

  const like = (actor: DevMember, target: DevMember, options: Partial<LikePlan> = {}) => {
    const key = `${actor.id}>${target.id}`;
    if (actor.id === target.id || likes.has(key) || blocked.has(pairKey(actor.id, target.id))) {
      return false;
    }
    const kind = options.kind ?? (random.chance(0.06) ? "superlike" : "like");
    const content =
      kind === "pass"
        ? null
        : random.chance(0.5)
          ? { type: "photo" as const, position: random.int(0, Math.max(0, target.photoCount - 1)) }
          : { type: "prompt" as const, position: random.int(0, 2) };
    likes.set(key, {
      actorId: actor.id,
      targetId: target.id,
      kind,
      content,
      comment:
        options.comment !== undefined
          ? options.comment
          : kind === "superlike" || (kind === "like" && random.chance(0.4))
            ? random.pick(LIKE_COMMENTS)
            : null,
      hoursAgo: options.hoursAgo ?? random.int(1, 24 * 20),
    });
    return true;
  };

  const conversation = (a: DevMember, b: DevMember, length: number): MessagePlan[] => {
    const messages: MessagePlan[] = [];
    let minutes = random.int(5, 600);
    let [first, second] = random.chance(0.5) ? [a, b] : [b, a];
    if (length === 0) {
      return messages;
    }
    messages.push({ senderId: first.id, text: random.pick(OPENERS), minutesAfterMatch: minutes });
    const exchanges = random.sample(EXCHANGES, Math.floor((length - 1) / 2));
    for (const [question, answer] of exchanges) {
      [first, second] = random.chance(0.5) ? [first, second] : [second, first];
      minutes += random.int(2, 240);
      messages.push({ senderId: second.id, text: question, minutesAfterMatch: minutes });
      minutes += random.int(1, 180);
      messages.push({ senderId: first.id, text: answer, minutesAfterMatch: minutes });
    }
    if (messages.length < length) {
      minutes += random.int(1, 60);
      messages.push({ senderId: second.id, text: random.pick(CLOSERS), minutesAfterMatch: minutes });
    }
    return messages;
  };

  const matchPair = (a: DevMember, b: DevMember, messageCount: number, hoursAgo?: number) => {
    const key = pairKey(a.id, b.id);
    const mode = sharedMode(a, b);
    if (a.id === b.id || matches.has(key) || blocked.has(key) || !mode) {
      return false;
    }
    const age = hoursAgo ?? random.int(6, 24 * 25);
    like(a, b, { hoursAgo: age + random.int(1, 72) });
    like(b, a, { hoursAgo: age });
    // A pass recorded earlier in the loop would contradict the match: turn it into a like.
    for (const [actor, target] of [
      [a, b],
      [b, a],
    ] as const) {
      const existing = likes.get(`${actor.id}>${target.id}`);
      if (existing?.kind === "pass") {
        likes.set(`${actor.id}>${target.id}`, {
          ...existing,
          kind: "like",
          content: { type: "prompt", position: 0 },
        });
      }
    }
    const messages = conversation(a, b, messageCount);
    const last = messages.at(-1);
    const unreadFor = new Map<string, number>();
    if (last && random.chance(0.35)) {
      unreadFor.set(last.senderId === a.id ? b.id : a.id, 1);
    }
    matches.set(key, { userA: a.id, userB: b.id, mode, hoursAgo: age, messages, unreadFor });
    return true;
  };

  // Scripted stories around the personas (docs/00-vision.md).
  const ines = persona("ines");
  const hugo = persona("hugo");
  const sarah = persona("sarah");
  const malik = persona("malik");
  const camille = persona("camille");

  like(ines, hugo, {
    kind: "like",
    comment: "Trois heures pour un point-virgule, je compatis 😅",
    hoursAgo: 80,
  });
  matchPair(ines, hugo, 14, 72);
  matchPair(camille, malik, 7, 30);

  const compatibleWith = (member: DevMember) =>
    ordinary.filter(
      (other) => sharedMode(member, other) !== null && !blocked.has(pairKey(member.id, other.id)),
    );

  for (const admirer of random.sample(compatibleWith(sarah), 16)) {
    like(admirer, sarah, { hoursAgo: random.int(1, 24 * 6) });
  }
  for (const admirer of random.sample(compatibleWith(hugo), 4)) {
    like(admirer, hugo, { hoursAgo: random.int(1, 24 * 3) });
  }
  for (const member of [ines, hugo, sarah, malik, camille]) {
    for (const other of random.sample(compatibleWith(member), 3)) {
      matchPair(member, other, random.chance(0.6) ? random.int(3, 12) : 0);
    }
    for (const other of random.sample(compatibleWith(member), 3)) {
      like(member, other, { kind: "pass" });
    }
  }

  // Background activity of everyone else.
  for (const member of ordinary) {
    const candidates = compatibleWith(member);
    for (const other of random.sample(candidates, random.int(0, 6))) {
      like(member, other);
    }
    for (const other of random.sample(candidates, random.int(0, 5))) {
      like(member, other, { kind: "pass" });
    }
  }
  for (let i = 0; i < 240; i++) {
    const [a, b] = random.sample(ordinary, 2);
    if (a && b) {
      matchPair(a, b, random.chance(0.65) ? random.int(2, 16) : 0);
    }
  }
  // Organic reciprocal likes also become matches.
  for (const plan of [...likes.values()]) {
    const reverse = likes.get(`${plan.targetId}>${plan.actorId}`);
    if (plan.kind !== "pass" && reverse && reverse.kind !== "pass") {
      const a = members.find((m) => m.id === plan.actorId);
      const b = members.find((m) => m.id === plan.targetId);
      if (a && b) {
        matchPair(a, b, random.chance(0.5) ? random.int(1, 8) : 0, Math.min(plan.hoursAgo, reverse.hoursAgo));
      }
    }
  }

  return { likes: [...likes.values()], matches: [...matches.values()], blocks, hiddenContacts };
}
