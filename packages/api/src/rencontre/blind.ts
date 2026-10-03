import { blindRevealed } from "@epilove/core";
import type { Database } from "@epilove/db";
import { type BlindState, blindStates } from "@epilove/db/repositories/discovery";

/**
 * Blind mode (DEC-10): the members whose photos the viewer must not see yet,
 * because of a blind match not revealed (ten messages each) or a pending
 * blind like either way.
 */
export async function hiddenPhotos(
  db: Database,
  viewerId: string,
  otherIds: readonly string[],
): Promise<{ readonly hidden: ReadonlySet<string>; readonly states: ReadonlyMap<string, BlindState> }> {
  const states = await blindStates(db, viewerId, otherIds);
  const hidden = new Set<string>();
  for (const [otherId, state] of states) {
    if (state.match ? !blindRevealed(state.match) : state.pendingLike) {
      hidden.add(otherId);
    }
  }
  return { hidden, states };
}
