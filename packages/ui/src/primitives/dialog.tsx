"use client";

import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

export interface DialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
  readonly closeLabel?: string;
  readonly className?: string;
}

const BACKDROP =
  "fixed inset-0 z-50 bg-ink/70 backdrop-blur-sm transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0";

/** Docked to the bottom on small screens, centred on larger ones. */
const POPUP = cn(
  "fixed inset-x-0 bottom-0 z-50 max-h-[90dvh] overflow-y-auto rounded-t-[2rem] border border-paper/10 bg-ink2 text-paper shadow-2xl",
  "transition-[transform,opacity] duration-300 ease-out data-[ending-style]:translate-y-8 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-8 data-[starting-style]:opacity-0",
  "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-[min(32rem,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[2rem]",
  "sm:data-[ending-style]:translate-y-[-48%] sm:data-[starting-style]:translate-y-[-48%]",
);

/** Centred on desktop, docked to the bottom on small screens. */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  closeLabel = "Fermer",
  className,
}: DialogProps) {
  return (
    <BaseDialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={BACKDROP} />
        <BaseDialog.Popup
          className={cn(POPUP, "p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6", className)}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <BaseDialog.Title className="font-display font-semibold text-2xl tracking-tight">
                {title}
              </BaseDialog.Title>
              {description ? (
                <BaseDialog.Description className="text-paper/70">{description}</BaseDialog.Description>
              ) : null}
            </div>
            <BaseDialog.Close
              aria-label={closeLabel}
              className="-mr-2 -mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-paper/70 hover:bg-paper/10 hover:text-paper focus-visible:outline-2 focus-visible:outline-volt"
            >
              <X className="size-5" aria-hidden="true" />
            </BaseDialog.Close>
          </div>
          {children}
          {footer ? (
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{footer}</div>
          ) : null}
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}

export interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  /** Id of the heading that the content renders itself. */
  readonly labelledBy: string;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Same modal as `Dialog` (focus trap, Escape, click outside), for free-form
 * contents that bring their own heading and actions: like sheet, filters,
 * photo preview… Keys pressed inside do not reach the screen behind.
 */
export function Sheet({ open, onClose, labelledBy, children, className }: SheetProps) {
  return (
    <BaseDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <BaseDialog.Portal>
        <BaseDialog.Backdrop className={BACKDROP} />
        <BaseDialog.Popup
          aria-labelledby={labelledBy}
          onKeyDown={(event) => event.stopPropagation()}
          className={cn(POPUP, className)}
        >
          <div className="flex flex-col gap-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-7">
            {children}
          </div>
        </BaseDialog.Popup>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
