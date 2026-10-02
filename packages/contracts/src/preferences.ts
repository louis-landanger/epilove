import { GENDERS, MODES } from "@epilove/core";
import { oc } from "@orpc/contract";
import { z } from "zod";

export const privacySettings = z.object({
  modes: z.array(z.enum(MODES)),
  /** Sensitive data (GDPR art. 9): only present with the consent. */
  sensitiveConsent: z.boolean(),
  interestedIn: z.array(z.enum(GENDERS)),
  ageMin: z.int(),
  ageMax: z.int(),
  hideFromOwnSchool: z.boolean(),
  hideFromOwnYear: z.boolean(),
  incognito: z.boolean(),
  discreetNotifications: z.boolean(),
});
export type PrivacySettings = z.infer<typeof privacySettings>;

const errors = {
  NO_PROFILE: { status: 409 },
  INVALID_VALUE: { status: 422, data: z.object({ field: z.string() }) },
};

export const hiddenContactItem = z.object({ id: z.uuid(), hint: z.string(), createdAt: z.iso.datetime() });

/** Discovery and privacy settings (SAF-03 to SAF-07, ONB-05). */
export const preferencesContract = {
  get: oc.errors(errors).output(privacySettings),
  update: oc
    .errors(errors)
    .input(
      z.object({
        ageMin: z.int().min(18).max(99).optional(),
        ageMax: z.int().min(18).max(99).optional(),
        hideFromOwnSchool: z.boolean().optional(),
        hideFromOwnYear: z.boolean().optional(),
        incognito: z.boolean().optional(),
        discreetNotifications: z.boolean().optional(),
      }),
    )
    .output(privacySettings),
  /**
   * Modes and genders sought. Love mode needs the separate sensitive-data
   * consent; withdrawing it erases the genders sought and keeps Friends mode.
   */
  setModes: oc
    .errors(errors)
    .input(
      z.object({
        modes: z.array(z.enum(MODES)).min(1).max(MODES.length),
        sensitiveConsent: z.boolean(),
        interestedIn: z.array(z.enum(GENDERS)).max(GENDERS.length),
      }),
    )
    .output(privacySettings),
  /** Addresses the member never wants to see or be seen by (SAF-04). Only fingerprints are stored. */
  hiddenContacts: oc.output(z.object({ contacts: z.array(hiddenContactItem) })),
  hideContact: oc
    .errors({
      ...errors,
      TOO_MANY: { status: 409 },
    })
    .input(z.object({ email: z.string().max(320) }))
    .output(z.object({ contacts: z.array(hiddenContactItem) })),
  unhideContact: oc
    .errors({ NOT_FOUND: { status: 404 } })
    .input(z.object({ id: z.uuid() }))
    .output(z.object({ contacts: z.array(hiddenContactItem) })),
};
