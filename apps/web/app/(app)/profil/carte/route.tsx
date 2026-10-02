import { SCHOOLS, type SchoolSlug } from "@epilove/core";
import { colors, schoolColors } from "@epilove/tokens";
import { ImageResponse } from "next/og";
import { oklchToHex } from "@/lib/oklch";
import { serverApi } from "@/lib/server/api-app";

const WIDTH = 1080;
const HEIGHT = 1350;

/**
 * Shareable profile card (PRO-08), rendered on demand for its owner only and
 * never stored at a public address. Each piece of content is opt-in.
 */
export async function GET(request: Request) {
  const api = await serverApi();
  const [profile, catalog] = await Promise.all([
    api.profile.me().catch(() => null),
    api.profile.catalog().catch(() => null),
  ]);
  if (!profile || !catalog) {
    return new Response("Not found", { status: 404 });
  }
  const options = new URL(request.url).searchParams;
  const showName = options.get("prenom") !== "0";
  const showSchool = options.get("ecole") !== "0";
  const showInterests = options.get("interets") === "1";
  const showSong = options.get("son") === "1" && profile.anthem !== null;
  const answer = profile.promptAnswers.find((item) => item.promptId === options.get("prompt"));
  const question = answer ? catalog.prompts.find((item) => item.id === answer.promptId)?.text.fr : undefined;
  const interests = showInterests
    ? profile.interestIds
        .slice(0, 5)
        .flatMap((id) => catalog.interests.find((item) => item.id === id)?.label.fr ?? [])
    : [];
  const school = SCHOOLS.find((item) => item.slug === profile.schoolSlug);
  const accent = school ? oklchToHex(schoolColors[school.slug as SchoolSlug]) : oklchToHex(colors.plasma);
  const plasma = oklchToHex(colors.plasma);
  const volt = oklchToHex(colors.volt);
  const ink = oklchToHex(colors.ink);
  const paper = oklchToHex(colors.paper);

  const image = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 64,
        background: ink,
        backgroundImage: `radial-gradient(circle at 15% 10%, ${plasma}88, transparent 45%), radial-gradient(circle at 90% 85%, ${volt}66, transparent 40%), radial-gradient(circle at 80% 20%, ${accent}77, transparent 40%)`,
        fontFamily: "sans-serif",
        color: paper,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          padding: 64,
          borderRadius: 64,
          border: `2px solid ${paper}33`,
          background: `linear-gradient(135deg, ${paper}1f, ${paper}08 40%, ${accent}26 70%, ${paper}0d)`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
            epilove<span style={{ color: plasma }}>.</span>
          </span>
          {showSchool && school ? (
            <span
              style={{
                display: "flex",
                padding: "12px 28px",
                borderRadius: 999,
                border: `2px solid ${accent}`,
                color: accent,
                fontSize: 30,
                letterSpacing: 2,
              }}
            >
              {school.name} · LYON
            </span>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {showName ? (
            <span style={{ fontSize: 150, fontWeight: 800, letterSpacing: -6, lineHeight: 1 }}>
              {profile.firstName}
            </span>
          ) : null}
          {answer && question ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <span style={{ fontSize: 32, color: `${paper}aa` }}>{question}</span>
              <span style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.15 }}>{answer.text}</span>
            </div>
          ) : null}
          {interests.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
              {interests.map((label) => (
                <span
                  key={label}
                  style={{
                    display: "flex",
                    padding: "10px 24px",
                    borderRadius: 999,
                    border: `2px solid ${paper}44`,
                    fontSize: 28,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          ) : null}
          {showSong && profile.anthem ? (
            <span style={{ fontSize: 30, color: `${paper}cc` }}>
              ♫ {profile.anthem.title} · {profile.anthem.artist}
            </span>
          ) : null}
        </div>
        <span style={{ fontSize: 28, color: `${paper}88` }}>Campus IONIS de Lyon · étudiants vérifiés</span>
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT },
  );
  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", 'inline; filename="ma-carte-epilove.png"');
  return new Response(image.body, { status: 200, headers });
}
