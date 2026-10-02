import Link from "next/link";
import { getMessages, getTranslations } from "next-intl/server";
import { Fragment } from "react";
import {
  asLegalPage,
  LEGAL_PAGES,
  type LegalBlock,
  type LegalPageKey,
  splitPlaceholders,
} from "./legal-content";

function Text({ children }: { children: string }) {
  return (
    <>
      {splitPlaceholders(children).map((part, index) =>
        part.placeholder ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of a fixed string.
          <mark key={index}>{part.text}</mark>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts of a fixed string.
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    return (
      <p>
        <Text>{block}</Text>
      </p>
    );
  }
  if ("list" in block) {
    return (
      <ul>
        {block.list.map((item) => (
          <li key={item}>
            <Text>{item}</Text>
          </li>
        ))}
      </ul>
    );
  }
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable region must be reachable by keyboard (WCAG 2.1.1).
    <section className="legal-table-wrapper" tabIndex={0} aria-label={block.table.caption}>
      <table>
        <caption>{block.table.caption}</caption>
        <thead>
          <tr>
            {block.table.head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.table.rows.map((row) => (
            <tr key={row.join("|")}>
              {row.map((cell, index) =>
                index === 0 ? (
                  <th key={cell} scope="row" className="font-normal">
                    <Text>{cell}</Text>
                  </th>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells of a fixed row.
                  <td key={index}>
                    <Text>{cell}</Text>
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** A draft legal page, plainly typeset, with its table of contents and the "draft" warning on top. */
export async function LegalDocument({ page }: { page: LegalPageKey }) {
  const t = await getTranslations("legal");
  const content = asLegalPage((await getMessages()).legal[page]);
  return (
    <article>
      <p
        role="note"
        className="flex flex-col gap-1 rounded-2xl border border-volt/50 bg-volt/10 px-5 py-4 text-paper sm:flex-row sm:items-center sm:gap-4"
      >
        <strong className="font-mono font-semibold text-volt text-xs uppercase tracking-[0.18em]">
          {t("draft")}
        </strong>
        <span className="text-paper/85 text-sm">{t("draftNote")}</span>
      </p>

      <nav aria-label={t("nav.label")} className="mt-10">
        <ul className="flex flex-wrap gap-2">
          {(Object.keys(LEGAL_PAGES) as LegalPageKey[]).map((key) => (
            <li key={key}>
              <Link
                href={LEGAL_PAGES[key]}
                aria-current={key === page ? "page" : undefined}
                className="inline-flex min-h-11 items-center rounded-full border border-paper/15 px-4 font-mono text-paper/85 text-xs uppercase tracking-[0.12em] hover:border-paper/50 aria-[current=page]:border-plasma aria-[current=page]:bg-plasma aria-[current=page]:text-ink"
              >
                {t(`nav.${key}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <h1 className="mt-12 font-display font-semibold text-[clamp(2.6rem,7vw,5.5rem)] text-paper leading-[0.95] tracking-[-0.03em]">
        {content.title}
      </h1>
      <p className="mt-4 font-mono text-paper/70 text-xs uppercase tracking-[0.16em]">{t("version")}</p>

      <nav aria-labelledby="toc-title" className="mt-10 rounded-2xl border border-paper/10 p-5">
        <p id="toc-title" className="font-mono text-paper/75 text-xs uppercase tracking-[0.16em]">
          {t("toc")}
        </p>
        <ol className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
          {content.sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-paper/85 underline decoration-paper/25 underline-offset-4 hover:text-paper hover:decoration-plasma"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="legal-body">
        {content.sections.map((section) => (
          <section key={section.id} aria-labelledby={section.id}>
            <h2 id={section.id}>{section.title}</h2>
            {section.blocks.map((block, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: blocks are an ordered, fixed list.
              <Block key={index} block={block} />
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
