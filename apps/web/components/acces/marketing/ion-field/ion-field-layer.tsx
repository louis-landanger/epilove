import { IonFieldCanvas } from "./ion-field-canvas";

/**
 * The live field, behind the whole landing: it follows the visitor down the
 * page (journey.ts). Below every section's content (negative z-index in the
 * isolated `.marketing` root), so opaque cards hide it and glass shows it.
 */
export function IonFieldLayer() {
  return (
    <div aria-hidden="true" className="-z-10 pointer-events-none fixed inset-0">
      <IonFieldCanvas className="absolute inset-0 size-full" />
    </div>
  );
}
