/**
 * Date proposals (CHAT-10): a card in the conversation with a place (a Spot
 * or a free text), a time and a word. The other member accepts, declines or
 * proposes something else; an accepted date can go to a calendar (.ics).
 */
export const DATE_RULES = {
  minLeadMinutes: 60,
  maxLeadDays: 60,
  noteMaxLength: 200,
  placeMaxLength: 120,
  durationMinutes: 90,
} as const;

export const DATE_STATUSES = ["proposed", "accepted", "declined", "countered"] as const;
export type DateStatus = (typeof DATE_STATUSES)[number];

export type DateProposalCheck = { ok: true } | { ok: false; reason: "too_soon" | "too_far" | "no_place" };

export function checkDateProposal(
  input: { startsAt: Date; spotId: string | null; place: string | null },
  now: Date,
): DateProposalCheck {
  if (!input.spotId && !input.place?.trim()) {
    return { ok: false, reason: "no_place" };
  }
  const lead = input.startsAt.getTime() - now.getTime();
  if (lead < DATE_RULES.minLeadMinutes * 60_000) {
    return { ok: false, reason: "too_soon" };
  }
  if (lead > DATE_RULES.maxLeadDays * 86_400_000) {
    return { ok: false, reason: "too_far" };
  }
  return { ok: true };
}

export type DateResponseCheck =
  | { ok: true }
  | { ok: false; reason: "own_proposal" | "already_answered" | "past" };

/** Only the other member answers, once, and only before the date. */
export function checkDateResponse(
  proposal: { proposerId: string | null; status: DateStatus; startsAt: Date },
  viewerId: string,
  now: Date,
): DateResponseCheck {
  if (proposal.proposerId === viewerId) {
    return { ok: false, reason: "own_proposal" };
  }
  if (proposal.status !== "proposed") {
    return { ok: false, reason: "already_answered" };
  }
  if (proposal.startsAt <= now) {
    return { ok: false, reason: "past" };
  }
  return { ok: true };
}

const pad = (value: number) => String(value).padStart(2, "0");
const icsDate = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(
    date.getUTCMinutes(),
  )}${pad(date.getUTCSeconds())}Z`;

/** RFC 5545 text escaping: backslash, semicolon, comma and line breaks get a backslash. */
const BACKSLASH = String.fromCharCode(92);
const ICS_ESCAPES: Readonly<Record<string, string>> = {
  [BACKSLASH]: BACKSLASH + BACKSLASH,
  ";": `${BACKSLASH};`,
  ",": `${BACKSLASH},`,
  "\n": `${BACKSLASH}n`,
};

export function escapeIcsText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[\\;,\n]/g, (char) => ICS_ESCAPES[char] ?? char);
}

/** Lines longer than 75 octets are folded (RFC 5545, 3.1). */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    if (new TextEncoder().encode(current + char).length > 75) {
      parts.push(current);
      current = ` ${char}`;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n");
}

/** A calendar file for an accepted date. No first name: the title stays neutral. */
export function dateIcs(input: {
  uid: string;
  startsAt: Date;
  title: string;
  location: string;
  description?: string;
  now?: Date;
  durationMinutes?: number;
}): string {
  const end = new Date(
    input.startsAt.getTime() + (input.durationMinutes ?? DATE_RULES.durationMinutes) * 60_000,
  );
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Epilove//Date//FR",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}@epilove`,
    `DTSTAMP:${icsDate(input.now ?? new Date())}`,
    `DTSTART:${icsDate(input.startsAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `LOCATION:${escapeIcsText(input.location)}`,
    ...(input.description ? [`DESCRIPTION:${escapeIcsText(input.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
