import { SCHOOLS } from "@atomes/core";
import Image from "next/image";
import { getTranslations } from "next-intl/server";

/**
 * The liaison of French reading books (« les‿enfants »), drawn under the
 * space between two words like a stroke of felt pen: in chemistry, in
 * grammar and between two people, a liaison is what holds them together.
 */
function Tie() {
  return (
    <span className="liaison-tie" aria-hidden="true">
      <svg viewBox="0 0 52 20" aria-hidden="true" focusable="false">
        <path d="M3 4 C 12 17, 36 18, 49 2" pathLength={1} />
      </svg>
    </span>
  );
}

/**
 * Hero under study (`/apercu/liaison`, docs/02-design.md, section 5): a
 * photograph of Lyon, full bleed, and the title over it in the serif, with a
 * liaison under « tes‿atomes ». One call, the schools, and nothing that
 * glows, floats or fades: the photograph is provisional, until the campus
 * shoot with student volunteers.
 */
export async function LiaisonHero() {
  const t = await getTranslations("home");

  return (
    <section id="hero" aria-labelledby="hero-title" className="hero liaison-hero" data-field-cover>
      <Image
        src="/apercu/liaison/grande-cote.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        quality={72}
        className="liaison-photo"
      />
      <div className="liaison-inner">
        <h1 id="hero-title" className="liaison-title">
          {t.rich("liaison.title", {
            line: (chunks) => <span className="liaison-line">{chunks}</span>,
            pair: (chunks) => <span className="liaison-pair">{chunks}</span>,
            tie: () => <Tie />,
          })}
        </h1>
        <div className="liaison-foot">
          <p className="liaison-lead">{t("liaison.lead")}</p>
          <div className="liaison-call">
            <a href="#rejoindre" className="liaison-cta">
              {t("cta")}
            </a>
            <ul aria-label={t("schools")} className="hero-schools liaison-schools">
              {SCHOOLS.map((school) => (
                <li key={school.slug}>{school.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <p className="liaison-credit">{t("liaison.photo")}</p>
    </section>
  );
}
