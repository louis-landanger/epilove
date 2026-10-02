"use client";

import { Toast } from "@base-ui/react/toast";
import { CircleAlert, CircleCheck, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../cn";

export type ToastTone = "neutral" | "success" | "error";

/** Wrap the app once; then call `useToast()` anywhere. */
export function ToastProvider({ children }: { children: ReactNode }) {
  return (
    <Toast.Provider timeout={5000} limit={3}>
      {children}
      <Toast.Portal>
        <Toast.Viewport className="fixed top-[max(1rem,env(safe-area-inset-top))] right-4 left-4 z-[60] mx-auto flex max-w-sm flex-col gap-2 sm:left-auto">
          <ToastList />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  );
}

function ToastList() {
  const { toasts } = Toast.useToastManager();
  return toasts.map((toast) => {
    const tone = (toast.type as ToastTone | undefined) ?? "neutral";
    return (
      <Toast.Root
        key={toast.id}
        toast={toast}
        className={cn(
          "rounded-2xl border border-paper/10 bg-ink2/95 p-4 text-paper shadow-2xl backdrop-blur",
          "transition-[transform,opacity] duration-300 ease-out data-[ending-style]:opacity-0 data-[starting-style]:-translate-y-3 data-[starting-style]:opacity-0",
        )}
      >
        <Toast.Content className="flex items-start gap-3">
          {tone === "success" ? (
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          ) : null}
          {tone === "error" ? (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-danger" aria-hidden="true" />
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <Toast.Title className="font-semibold" />
            <Toast.Description className="text-paper/70 text-sm" />
          </div>
          <Toast.Close aria-label="Fermer" className="-m-1 rounded-full p-1 text-paper/60 hover:text-paper">
            <X className="size-4" aria-hidden="true" />
          </Toast.Close>
        </Toast.Content>
      </Toast.Root>
    );
  });
}

export function useToast() {
  const manager = Toast.useToastManager();
  return {
    show: (title: string, options: { description?: string; tone?: ToastTone } = {}) =>
      manager.add({ title, description: options.description, type: options.tone ?? "neutral" }),
    success: (title: string, description?: string) => manager.add({ title, description, type: "success" }),
    error: (title: string, description?: string) =>
      manager.add({ title, description, type: "error", priority: "high" }),
  };
}
