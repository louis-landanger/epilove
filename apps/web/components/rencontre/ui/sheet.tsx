"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * Accessible bottom sheet on mobile, centred dialog on desktop, built on the
 * native <dialog> element (focus trap, Escape, inert background for free).
 */
export function Sheet({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) {
      return;
    }
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) {
          onClose();
        }
      }}
      onKeyDown={(event) => event.stopPropagation()}
      className="m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-[28px] border border-paper/10 bg-ink p-0 text-paper backdrop:bg-ink/70 backdrop:backdrop-blur-sm open:animate-[sheet-in_320ms_cubic-bezier(0.16,1,0.3,1)] sm:m-auto sm:max-w-lg sm:rounded-[28px]"
    >
      <div className="flex flex-col gap-5 p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:p-7">
        {children}
      </div>
    </dialog>
  );
}
