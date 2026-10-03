"use client";

import type { DevMember } from "@epilove/contracts";
import { schoolColors } from "@epilove/tokens";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { chooseDevMember } from "@/app/dev/actions";

const PERSONA_COUNT = 5;
const GENDER_LABELS = { woman: "femme", man: "homme", nonbinary: "non binaire" } as const;
const MODE_LABELS = { love: "Love", friends: "Amis" } as const;
const LINKS = [
  ["/decouvrir", "Découvrir"],
  ["/likes", "Likes"],
  ["/messages", "Messages"],
  ["/campus", "Campus"],
  ["/notifications", "Notifications"],
] as const;

export function DevMemberPicker({ members, current }: { members: DevMember[]; current: string | null }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [school, setSchool] = useState("all");
  const [pending, startTransition] = useTransition();

  const schools = useMemo(
    () => [...new Map(members.map((m) => [m.schoolSlug, m.schoolName])).entries()],
    [members],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members
      .slice(PERSONA_COUNT)
      .filter(
        (m) => (school === "all" || m.schoolSlug === school) && (!q || m.firstName.toLowerCase().includes(q)),
      )
      .slice(0, 60);
  }, [members, query, school]);

  const choose = (id: string | null) =>
    startTransition(async () => {
      const form = new FormData();
      form.set("memberId", id ?? "");
      await chooseDevMember(form);
      router.refresh();
    });

  const currentMember = members.find((m) => m.id === current);

  return (
    <div className="flex flex-col gap-10" aria-busy={pending}>
      <section
        aria-labelledby="dev-current"
        className="flex flex-wrap items-center gap-4 rounded-3xl border border-paper/15 p-5"
      >
        <h2 id="dev-current" className="sr-only">
          Membre courant
        </h2>
        <p className="text-paper/80">
          {currentMember ? (
            <>
              Tu navigues en tant que <strong className="text-paper">{currentMember.firstName}</strong> (
              {currentMember.schoolName}).
            </>
          ) : (
            "Aucun membre choisi : l'API te considère comme non connecté·e."
          )}
        </p>
        <nav aria-label="Pages de rencontre" className="flex flex-wrap gap-2">
          {LINKS.map(([href, label]) => (
            <a
              key={href}
              href={href}
              className="rounded-full border border-paper/20 px-3 py-1.5 text-sm hover:border-volt"
            >
              {label}
            </a>
          ))}
        </nav>
        {currentMember && (
          <button
            type="button"
            onClick={() => choose(null)}
            className="ml-auto text-paper/60 text-sm underline"
          >
            Se déconnecter
          </button>
        )}
      </section>

      <section aria-labelledby="dev-personas" className="flex flex-col gap-4">
        <h2 id="dev-personas" className="font-display font-semibold text-2xl">
          Personas
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {members.slice(0, PERSONA_COUNT).map((m) => (
            <li key={m.id}>
              <MemberButton member={m} active={m.id === current} onChoose={choose} large />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="dev-all" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <h2 id="dev-all" className="mr-auto font-display font-semibold text-2xl">
            Tous les membres
          </h2>
          <label className="flex flex-col gap-1 text-paper/70 text-sm">
            Prénom
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rounded-xl border border-paper/20 bg-transparent px-3 py-2 text-paper"
            />
          </label>
          <label className="flex flex-col gap-1 text-paper/70 text-sm">
            École
            <select
              value={school}
              onChange={(event) => setSchool(event.target.value)}
              className="rounded-xl border border-paper/20 bg-ink px-3 py-2 text-paper"
            >
              <option value="all">Toutes</option>
              {schools.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <li key={m.id}>
              <MemberButton member={m} active={m.id === current} onChoose={choose} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function MemberButton({
  member,
  active,
  onChoose,
  large = false,
}: {
  member: DevMember;
  active: boolean;
  onChoose: (id: string) => void;
  large?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => onChoose(member.id)}
      aria-pressed={active}
      className={`flex w-full flex-col gap-1 rounded-2xl border p-4 text-left transition-colors ${
        active ? "border-volt bg-volt/10" : "border-paper/15 hover:border-paper/40"
      } ${large ? "min-h-28" : ""}`}
    >
      <span className="flex items-center gap-2 font-semibold">
        <span
          aria-hidden="true"
          className="size-2.5 rounded-full"
          style={{ backgroundColor: schoolColors[member.schoolSlug as keyof typeof schoolColors] }}
        />
        {member.firstName}, {member.age} ans
      </span>
      <span className="text-paper/70 text-sm">
        {member.schoolName} · {GENDER_LABELS[member.gender]} ·{" "}
        {member.modes.map((mode) => MODE_LABELS[mode]).join(" + ")}
      </span>
      {member.status !== "active" && <span className="font-mono text-plasma text-xs">{member.status}</span>}
    </button>
  );
}
