import type { Catalog, OnboardingSaveInput, OnboardingState } from "@epilove/contracts";

export type SaveResult = { readonly ok: true } | { readonly ok: false; readonly field: string | null };

/** What every onboarding step receives from the flow. */
export interface StepProps {
  readonly state: OnboardingState;
  readonly catalog: Catalog;
  readonly save: (input: OnboardingSaveInput) => Promise<SaveResult>;
  /** Moves on without saving (steps that save elsewhere, such as photos). */
  readonly next: () => void;
  readonly pending: boolean;
  readonly focusTitle: boolean;
}
