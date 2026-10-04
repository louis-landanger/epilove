import { REACTION_WORDS } from "@atomes/core";
import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import { serverApi } from "@/lib/rencontre/api.server";
import { gated } from "@/lib/rencontre/gate";

/**
 * Wrapped as a story image (COM-03), 1080 × 1920, for the signed-in member
 * only and never cached. No emoji glyphs: the default renderer would fetch
 * them from a third party, so reactions are written as words.
 */
export async function GET() {
  const api = await serverApi();
  const result = await gated(() => api.community.wrapped());
  if (!result.ok) {
    return new Response(null, { status: result.gate === "signin" ? 401 : 404 });
  }
  const w = result.data;
  const t = await getTranslations("campus.wrapped");
  const rows = [
    { big: String(w.matches), text: t("matches", { count: w.matches }) },
    { big: String(w.messages), text: t("messages", { count: w.messages }) },
    { big: String(w.likes), text: t("likes", { count: w.likes }) },
    { big: String(w.events), text: t("events", { count: w.events }) },
  ];
  const extras = [
    w.favoriteReaction ? t("reactionWord", { word: REACTION_WORDS[w.favoriteReaction] ?? "" }) : null,
    w.peakHour !== null ? t("peakWord", { hour: w.peakHour }) : null,
  ].filter((line): line is string => line !== null);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "120px 96px",
        color: "#f4f1ea",
        backgroundColor: "#100e18",
        backgroundImage:
          "radial-gradient(circle at 85% 10%, rgba(255,63,164,0.45), transparent 45%), radial-gradient(circle at 10% 90%, rgba(199,255,72,0.25), transparent 45%)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 34, letterSpacing: 8, opacity: 0.7 }}>{`ATOMES · WRAPPED ${w.label}`}</div>
        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.05 }}>{t("imageTitle")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 56 }}>
        {rows.map((row) => (
          <div key={row.text} style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 150, fontWeight: 700, lineHeight: 1 }}>{row.big}</div>
            <div style={{ fontSize: 44, opacity: 0.85 }}>{row.text}</div>
          </div>
        ))}
        {extras.map((line) => (
          <div key={line} style={{ fontSize: 44, color: "#c7ff48" }}>
            {line}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 32, opacity: 0.6 }}>{t("imageFooter")}</div>
    </div>,
    {
      width: 1080,
      height: 1920,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
