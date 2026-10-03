"use client";

import { ORPCError } from "@orpc/client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { encode } from "uqr";
import { api } from "@/lib/api-client";

type ScanResult = { outcome: "waiting" | "matched"; match: { matchId: string; firstName: string } | null };

/** A QR code drawn as one SVG path (no injected markup). */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { border: 2, ecc: "M" });
    let d = "";
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) {
          d += `M${x} ${y}h1v1h-1z`;
        }
      });
    });
    return { path: d, size: qr.size };
  }, [value]);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="aspect-square w-full max-w-72 rounded-3xl bg-paper p-2"
    >
      <title>{label}</title>
      <path d={path} fill="#100e18" />
    </svg>
  );
}

const ERRORS = ["invalid_code", "flash_closed", "rate_limited"] as const;

/** The result of a scan, shared by the Flash screen and the page a QR code opens. */
export function FlashResult({ result, eventId }: { result: ScanResult; eventId: string }) {
  const t = useTranslations("events.flash");
  return result.outcome === "matched" && result.match ? (
    <div role="status" className="flex flex-col gap-3 rounded-3xl border border-volt/50 bg-volt/10 p-5">
      <p className="font-display font-semibold text-xl">{t("matched", { name: result.match.firstName })}</p>
      <Link
        href={`/messages/${result.match.matchId}`}
        className="self-start rounded-full bg-volt px-5 py-2.5 font-semibold text-ink"
      >
        {t("write", { name: result.match.firstName })}
      </Link>
    </div>
  ) : (
    <div role="status" className="flex flex-col gap-2 rounded-3xl border border-paper/15 p-5">
      <p>{t("waiting")}</p>
      <Link
        href={`/campus/evenements/${eventId}/flash`}
        className="self-start text-sm underline underline-offset-4"
      >
        {t("showMine")}
      </Link>
    </div>
  );
}

/**
 * Flash (IRL-04): one's own code, renewed every 30 seconds, as a QR code to
 * scan with any camera and as 8 characters to type; and a field to type the
 * other's code.
 */
export function FlashScreen({ eventId, title }: { eventId: string; title: string }) {
  const t = useTranslations("events.flash");
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [origin, setOrigin] = useState("");
  const [closed, setClosed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCode(await api.events.flashCode({ eventId }));
    } catch (failure) {
      if (failure instanceof ORPCError && failure.message === "flash_closed") {
        setClosed(true);
      }
    }
  }, [eventId]);

  useEffect(() => {
    setOrigin(window.location.origin);
    void refresh();
  }, [refresh]);

  // A new code as soon as the current one expires; the bar shows the time left.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (code && Date.parse(code.expiresAt) <= now) {
      void refresh();
    }
  }, [code, now, refresh]);

  const scan = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.events.flashScan({ eventId, code: typed }));
      setTyped("");
    } catch (failure) {
      const reason = failure instanceof ORPCError ? ERRORS.find((e) => e === failure.message) : undefined;
      setError(reason ? t(`errors.${reason}`) : t("errors.generic"));
    } finally {
      setBusy(false);
    }
  };

  const left = code ? Math.max(0, Date.parse(code.expiresAt) - now) : 0;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-6 pb-10">
      <header className="flex flex-col gap-2">
        <Link
          href={`/campus/evenements/${eventId}`}
          className="self-start text-paper/70 text-sm underline-offset-4 hover:underline"
        >
          {title}
        </Link>
        <h1 className="font-display font-semibold text-3xl tracking-tight">{t("title")}</h1>
        <p className="text-paper/75">{t("lead")}</p>
      </header>

      {closed ? (
        <p className="rounded-3xl border border-paper/15 border-dashed px-5 py-10 text-center text-paper/70">
          {t("closed")}
        </p>
      ) : (
        <>
          <section aria-labelledby="flash-mine" className="flex flex-col items-center gap-3">
            <h2 id="flash-mine" className="sr-only">
              {t("mine")}
            </h2>
            {code && origin ? (
              <QrCode
                value={`${origin}/campus/evenements/${eventId}/flash/${code.code}`}
                label={t("qrLabel")}
              />
            ) : (
              <span aria-hidden="true" className="aspect-square w-full max-w-72 rounded-3xl bg-paper/10" />
            )}
            <p className="font-mono text-3xl tracking-[0.3em]">
              <span aria-hidden="true">
                {code ? `${code.code.slice(0, 4)} ${code.code.slice(4)}` : "···· ····"}
              </span>
              <span className="sr-only">
                {t("codeLabel", { code: code?.code.split("").join(" ") ?? "" })}
              </span>
            </p>
            <span
              aria-hidden="true"
              className="block h-1 w-full max-w-72 overflow-hidden rounded-full bg-paper/10"
            >
              <span
                className="block h-full bg-volt transition-[width] duration-500 ease-linear"
                style={{ width: `${(left / 30_000) * 100}%` }}
              />
            </span>
            <p className="text-paper/60 text-xs">{t("renewed")}</p>
          </section>

          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void scan();
            }}
          >
            <label htmlFor="flash-code" className="font-semibold">
              {t("typeLabel")}
            </label>
            <div className="flex gap-2">
              <input
                id="flash-code"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={12}
                className="min-w-0 flex-1 rounded-2xl border border-paper/20 bg-transparent px-4 py-3 font-mono text-lg uppercase tracking-widest focus:border-volt focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy || typed.trim().length < 8}
                className="rounded-2xl bg-volt px-5 font-semibold text-ink disabled:opacity-50"
              >
                {t("scan")}
              </button>
            </div>
            <p className="text-paper/60 text-xs">{t("cameraHint")}</p>
            {error && (
              <p role="alert" className="text-plasma text-sm">
                {error}
              </p>
            )}
          </form>
          {result && <FlashResult result={result} eventId={eventId} />}
        </>
      )}
    </main>
  );
}
