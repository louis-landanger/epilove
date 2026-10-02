/**
 * Schools eligible on the Lyon campus. Adding a school is a configuration
 * change: one entry here, mirrored by the database seed (packages/db).
 *
 * School names are only used to describe eligibility: never logos or brand
 * assets (docs/08-juridique-rgpd.md).
 */
export const SCHOOL_SLUGS = ["epita", "esme", "supbiotech", "isg", "ipsa"] as const;

export type SchoolSlug = (typeof SCHOOL_SLUGS)[number];

export interface SchoolDefinition {
  readonly slug: SchoolSlug;
  readonly name: string;
  readonly emailDomains: readonly string[];
}

export interface CampusDefinition {
  readonly slug: string;
  readonly name: string;
  readonly timeZone: string;
}

export const LYON_CAMPUS: CampusDefinition = {
  slug: "lyon",
  name: "Lyon",
  timeZone: "Europe/Paris",
};

export const SCHOOLS: readonly SchoolDefinition[] = [
  { slug: "epita", name: "EPITA", emailDomains: ["epita.fr"] },
  { slug: "esme", name: "ESME", emailDomains: ["esme.fr"] },
  { slug: "supbiotech", name: "Sup'Biotech", emailDomains: ["supbiotech.fr"] },
  { slug: "isg", name: "ISG", emailDomains: ["isg.fr"] },
  { slug: "ipsa", name: "IPSA", emailDomains: ["ipsa.fr"] },
];

export type SchoolEmailResult =
  | { readonly ok: true; readonly canonicalEmail: string; readonly school: SchoolDefinition }
  | { readonly ok: false; readonly reason: "invalid_format" | "domain_not_allowed" };

const LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9_-]|\.(?!\.))*[a-z0-9]$|^[a-z0-9]$/;
const DOMAIN_PATTERN = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const MAX_LOCAL_PART_LENGTH = 64;

/**
 * Validates a school email and returns its canonical form.
 *
 * One address must map to one person (docs/00-vision.md). The schools run
 * Microsoft 365, where `first.last+anything@school.fr` reaches the same
 * mailbox as `first.last@school.fr`: the `+tag` suffix is therefore removed
 * before the address is used as an identity. Only exact domain matches are
 * accepted (`epita.fr.example.com` or `x.epita.fr` are rejected).
 */
export function parseSchoolEmail(
  input: string,
  schools: readonly SchoolDefinition[] = SCHOOLS,
): SchoolEmailResult {
  const email = input.trim().toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2) {
    return { ok: false, reason: "invalid_format" };
  }
  const [rawLocal = "", domain = ""] = parts;
  const local = rawLocal.split("+", 1)[0] ?? "";
  if (
    local.length === 0 ||
    local.length > MAX_LOCAL_PART_LENGTH ||
    !LOCAL_PART_PATTERN.test(local) ||
    !DOMAIN_PATTERN.test(domain)
  ) {
    return { ok: false, reason: "invalid_format" };
  }
  const school = schools.find((candidate) => candidate.emailDomains.includes(domain));
  if (!school) {
    return { ok: false, reason: "domain_not_allowed" };
  }
  return { ok: true, canonicalEmail: `${local}@${domain}`, school };
}
