"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";
import { PACT_REVEAL_AT } from "../marketing/pact";

interface Line {
  readonly id: number;
  readonly kind: "input" | "output";
  readonly text: string;
}

/** COM-05: a hidden shell. Nothing here is real, everything here is true. */
export function Terminal() {
  const t = useTranslations("common.terminal");
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([{ id: 0, kind: "output", text: t("welcome") }]);
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const counter = useRef(1);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  function print(...texts: string[]) {
    return texts.map((text) => ({ id: counter.current++, kind: "output" as const, text }));
  }

  function run(command: string): Line[] | "clear" {
    const [name = "", ...args] = command.trim().split(/\s+/);
    switch (name) {
      case "":
        return [];
      case "help":
        return print(t("help"));
      case "whoami":
        return print(t("whoami"));
      case "ls":
        return print(args[0]?.startsWith("ecoles") ? t("lsSchools") : t("ls"));
      case "cat":
        if (args[0] === "charte.txt") return print(...(t.raw("charter") as string[]));
        if (args[0] === "secret.txt") return print(t("secret"));
        return print(t("notFile", { file: args[0] ?? "" }));
      case "./pacte.sh":
      case "pacte.sh": {
        const days = Math.ceil((Date.parse(PACT_REVEAL_AT) - Date.now()) / 86_400_000);
        return print(days > 0 ? t("pact", { days }) : t("pactOpen"));
      }
      case "date":
        return print(new Date().toString());
      case "echo":
        return print(args.join(" "));
      case "coffee":
        return print(t("coffee"));
      case "sudo":
        return print(t("sudo"));
      case "clear":
        return "clear";
      case "exit":
        window.setTimeout(() => router.push("/"), 600);
        return print(t("bye"));
      default:
        return print(t("unknown", { command: name.slice(0, 40) }));
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const command = value.slice(0, 200);
    const output = run(command);
    setHistory((list) => (command.trim() ? [...list, command] : list));
    setCursor(null);
    setValue("");
    if (output === "clear") {
      setLines([]);
      return;
    }
    setLines((list) => [...list, { id: counter.current++, kind: "input", text: command }, ...output]);
    requestAnimationFrame(() => end.current?.scrollIntoView({ block: "end" }));
  }

  function browse(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (history.length === 0) return;
    const next =
      event.key === "ArrowUp"
        ? Math.max(0, (cursor ?? history.length) - 1)
        : Math.min(history.length, (cursor ?? history.length) + 1);
    setCursor(next);
    setValue(history[next] ?? "");
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: clicking anywhere focuses the prompt, like a real terminal
    // biome-ignore lint/a11y/useKeyWithClickEvents: the input itself handles the keyboard
    <div
      className="flex min-h-[70dvh] flex-col gap-1 rounded-3xl border border-volt/20 bg-ink2 p-5 font-mono text-sm text-volt shadow-[0_0_80px_-40px_var(--color-volt)]"
      onClick={() => input.current?.focus()}
    >
      <div role="log" aria-live="polite" className="flex flex-col gap-1">
        {lines.map((line) => (
          <p
            key={line.id}
            className={line.kind === "input" ? "text-paper" : "whitespace-pre-wrap text-volt/90"}
          >
            {line.kind === "input" ? <span className="text-plasma">campus@lyon:~$ </span> : null}
            {line.text}
          </p>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2">
        <label htmlFor="terminal-input" className="shrink-0 text-plasma">
          campus@lyon:~$<span className="sr-only"> {t("label")}</span>
        </label>
        <input
          id="terminal-input"
          ref={input}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={browse}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          // biome-ignore lint/a11y/noAutofocus: the page is the terminal; there is nothing else to focus
          autoFocus
          className="flex-1 bg-transparent text-paper caret-volt outline-none"
        />
      </form>
      <div ref={end} />
    </div>
  );
}
