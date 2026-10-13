import { SCHOOLS, type SchoolSlug } from "@atomes/core";
import { useSyncExternalStore } from "react";

/**
 * The school of the address being typed in the waiting list form, as soon as
 * what follows the "@" can only be its domain: "prenom@ep" is EPITA's, "@e"
 * could still be ESME's. Null otherwise. Read in the browser only, from the
 * field as it is typed: nothing is sent or kept.
 */
export function schoolOfTypedEmail(value: string): SchoolSlug | null {
  const parts = value.trim().toLowerCase().split("@");
  const domain = parts[1];
  if (parts.length !== 2 || !domain) {
    return null;
  }
  const matches = SCHOOLS.filter((school) => school.emailDomains.some((known) => known.startsWith(domain)));
  return matches.length === 1 ? (matches[0]?.slug ?? null) : null;
}

let typed: SchoolSlug | null = null;
const listeners = new Set<() => void>();

/** The form says which school the address being typed belongs to (or none). */
export function setTypedSchool(school: SchoolSlug | null): void {
  if (school !== typed) {
    typed = school;
    for (const listener of listeners) {
      listener();
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The school of the address being typed, for the logo stage beside the form. */
export function useTypedSchool(): SchoolSlug | null {
  return useSyncExternalStore(
    subscribe,
    () => typed,
    () => null,
  );
}
