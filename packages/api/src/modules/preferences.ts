import type { PrivacySettings } from "@epilove/contracts";
import {
  effectiveModes,
  emailHint,
  type Gender,
  isValidAgeRange,
  LEGAL_VERSIONS,
  type Mode,
  parseSchoolEmail,
  SAFETY_QUOTAS,
} from "@epilove/core";
import { emailHmac } from "@epilove/crypto";
import { type Database, schema } from "@epilove/db";
import {
  activeConsents,
  grantConsent,
  upsertPreferences,
  withdrawConsent,
} from "@epilove/db/repositories/accounts";
import { findOwnProfile } from "@epilove/db/repositories/profiles";
import {
  countHiddenContacts,
  deleteHiddenContact,
  insertHiddenContact,
  listHiddenContacts,
} from "@epilove/db/repositories/safety";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { os, requireViewer } from "../procedures";

async function loadSettings(db: Database, userId: string): Promise<PrivacySettings> {
  const [[prefs], consents] = await Promise.all([
    db.select().from(schema.preferences).where(eq(schema.preferences.userId, userId)).limit(1),
    activeConsents(db, userId),
  ]);
  if (!prefs) {
    throw new ORPCError("NO_PROFILE", { status: 409 });
  }
  const sensitiveConsent = consents.has("sensitive_data");
  return {
    modes: prefs.modes as Mode[],
    sensitiveConsent,
    interestedIn: sensitiveConsent ? (prefs.interestedIn as Gender[]) : [],
    ageMin: prefs.ageMin,
    ageMax: prefs.ageMax,
    hideFromOwnSchool: prefs.hideFromOwnSchool,
    hideFromOwnYear: prefs.hideFromOwnYear,
    incognito: prefs.incognito,
    discreetNotifications: prefs.discreetNotifications,
  };
}

async function contactsOf(db: Database, userId: string) {
  const rows = await listHiddenContacts(db, userId);
  return {
    contacts: rows.map((row) => ({ id: row.id, hint: row.hint, createdAt: row.createdAt.toISOString() })),
  };
}

/** Discovery and privacy settings (SAF-03 to SAF-07, ONB-05). */
export const preferences = {
  get: os.preferences.get.use(requireViewer).handler(async ({ context }) => {
    return loadSettings(context.database(), context.viewer.userId);
  }),

  update: os.preferences.update.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    const current = await loadSettings(db, userId);
    const ageMin = input.ageMin ?? current.ageMin;
    const ageMax = input.ageMax ?? current.ageMax;
    if (!isValidAgeRange(ageMin, ageMax)) {
      throw errors.INVALID_VALUE({ data: { field: "ageRange" } });
    }
    await upsertPreferences(db, userId, { ageMin, ageMax });
    const { ageMin: _min, ageMax: _max, ...flags } = input;
    const patch = Object.fromEntries(Object.entries(flags).filter(([, value]) => value !== undefined));
    if (Object.keys(patch).length > 0) {
      await db.update(schema.preferences).set(patch).where(eq(schema.preferences.userId, userId));
    }
    return loadSettings(db, userId);
  }),

  setModes: os.preferences.setModes.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    if (!(await findOwnProfile(db, userId))) {
      throw errors.NO_PROFILE();
    }
    const wantsLove = input.modes.includes("love");
    const consent = wantsLove && input.sensitiveConsent;
    const interestedIn = consent ? [...new Set(input.interestedIn)] : [];
    if (consent && interestedIn.length === 0) {
      throw errors.INVALID_VALUE({ data: { field: "interestedIn" } });
    }
    await db.transaction(async (tx) => {
      if (consent) {
        await grantConsent(tx, userId, "sensitive_data", LEGAL_VERSIONS.sensitive_data);
      } else if (!input.sensitiveConsent) {
        // Withdrawal (docs/08, section 3.1): Love mode off, genders sought erased.
        await withdrawConsent(tx, userId, "sensitive_data");
      }
      await upsertPreferences(tx, userId, {
        modes: effectiveModes([...new Set(input.modes)], consent),
        interestedIn,
      });
    });
    return loadSettings(db, userId);
  }),

  hiddenContacts: os.preferences.hiddenContacts.use(requireViewer).handler(async ({ context }) => {
    return contactsOf(context.database(), context.viewer.userId);
  }),

  hideContact: os.preferences.hideContact.use(requireViewer).handler(async ({ context, input, errors }) => {
    const { userId } = context.viewer;
    const db = context.database();
    const parsed = parseSchoolEmail(input.email);
    if (!parsed.ok) {
      throw errors.INVALID_VALUE({ data: { field: "email" } });
    }
    if ((await countHiddenContacts(db, userId)) >= SAFETY_QUOTAS.hiddenContacts) {
      throw errors.TOO_MANY();
    }
    const fingerprint = emailHmac(context.services.emailHmacSecret(), parsed.canonicalEmail);
    await insertHiddenContact(db, userId, fingerprint, emailHint(parsed.canonicalEmail));
    return contactsOf(db, userId);
  }),

  unhideContact: os.preferences.unhideContact
    .use(requireViewer)
    .handler(async ({ context, input, errors }) => {
      const { userId } = context.viewer;
      const db = context.database();
      if (!(await deleteHiddenContact(db, userId, input.id))) {
        throw errors.NOT_FOUND();
      }
      return contactsOf(db, userId);
    }),
};
