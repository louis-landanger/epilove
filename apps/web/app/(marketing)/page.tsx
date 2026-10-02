import { SCHOOLS } from "@epilove/core";
import { schoolColors } from "@epilove/tokens";

/**
 * Temporary home page until the real landing (docs/02-design.md, section 5)
 * ships with the waitlist in week 45.
 */
export default function HomePage() {
  return (
    <main className="relative isolate flex min-h-dvh flex-col justify-between overflow-hidden px-4 py-8 sm:px-10 sm:py-12">
      <Orbit />

      <p className="font-mono text-paper/70 text-xs uppercase tracking-[0.2em]">Campus IONIS · Lyon</p>

      <section className="max-w-5xl">
        <h1 className="font-display font-semibold text-[clamp(3.5rem,11vw,10rem)] leading-[0.9] tracking-tight">
          Trouve tes <em className="font-normal font-serif text-plasma italic">atomes crochus</em>.
        </h1>
        <p className="mt-8 max-w-xl text-lg text-paper/80 sm:text-xl">
          L'app de rencontre et d'amitié réservée aux étudiantes et étudiants vérifiés du campus. Ouverture
          prochaine.
        </p>
        <ul aria-label="Écoles concernées" className="mt-8 flex flex-wrap gap-2">
          {SCHOOLS.map((school) => (
            <li
              key={school.slug}
              className="flex items-center gap-2 rounded-full border border-paper/15 px-4 py-2 font-mono text-sm"
            >
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ backgroundColor: schoolColors[school.slug] }}
              />
              {school.name}
            </li>
          ))}
        </ul>
      </section>

      <footer className="text-paper/60 text-xs">
        Projet étudiant indépendant, non affilié à IONIS Education Group ni aux écoles citées.
      </footer>
    </main>
  );
}

function Orbit() {
  return (
    <div
      aria-hidden="true"
      className="-z-10 pointer-events-none absolute top-1/2 right-[-20vmin] size-[90vmin] -translate-y-1/2 opacity-60"
    >
      <div className="absolute inset-0 rounded-full border border-paper/10" />
      <div className="absolute inset-[18%] rounded-full border border-paper/10" />
      <div className="absolute inset-0 animate-[orbit_24s_linear_infinite]">
        <span className="-translate-x-1/2 absolute top-0 left-1/2 size-3 rounded-full bg-plasma shadow-[0_0_24px_var(--color-plasma)]" />
      </div>
      <div className="absolute inset-[18%] animate-[orbit_14s_linear_infinite_reverse]">
        <span className="-translate-x-1/2 absolute bottom-0 left-1/2 size-2 rounded-full bg-volt shadow-[0_0_18px_var(--color-volt)]" />
      </div>
    </div>
  );
}
