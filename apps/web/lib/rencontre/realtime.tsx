"use client";

import { parseRealtimeEvent, type RealtimeEvent } from "@epilove/realtime/events";
import { createContext, type ReactNode, use, useEffect, useRef, useState } from "react";
import { api } from "./api.client";

/**
 * Realtime connection (Centrifugo) for the signed-in member: one WebSocket per
 * tab, subscribed to the member's personal channel. Events only carry ids
 * (ADR 0020); screens refetch what they need through the API.
 *
 * After a reconnection, a `resync` signal tells screens to catch up through
 * the API, whether or not Centrifugo could replay the missed events.
 */
export type RealtimeSignal = RealtimeEvent | { readonly type: "resync" };
type Listener = (signal: RealtimeSignal) => void;
export type ConnectionState = "connecting" | "connected" | "disconnected";

interface RealtimeContextValue {
  subscribe(listener: Listener): () => void;
  readonly state: ConnectionState;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const [state, setState] = useState<ConnectionState>("connecting");

  useEffect(() => {
    let cancelled = false;
    let disconnect: (() => void) | undefined;
    const emit = (signal: RealtimeSignal) => {
      for (const listener of listeners.current) {
        listener(signal);
      }
    };

    (async () => {
      try {
        const first = await api.realtime.token();
        if (cancelled) {
          return;
        }
        const { Centrifuge } = await import("centrifuge");
        const client = new Centrifuge(first.url, {
          token: first.token,
          getToken: async () => (await api.realtime.token()).token,
        });
        client.on("connecting", () => setState("connecting"));
        client.on("connected", () => setState("connected"));
        client.on("disconnected", () => setState("disconnected"));
        const subscription = client.newSubscription(first.channel);
        let subscribedOnce = false;
        subscription.on("subscribed", () => {
          if (subscribedOnce) {
            emit({ type: "resync" });
          }
          subscribedOnce = true;
        });
        subscription.on("publication", (ctx) => {
          const event = parseRealtimeEvent(ctx.data);
          if (event) {
            emit(event);
          }
        });
        subscription.subscribe();
        client.connect();
        disconnect = () => {
          subscription.unsubscribe();
          client.disconnect();
        };
      } catch {
        // Not signed in, or realtime unavailable: screens still work, without live updates.
        if (!cancelled) {
          setState("disconnected");
        }
      }
    })();

    return () => {
      cancelled = true;
      disconnect?.();
    };
  }, []);

  const value: RealtimeContextValue = {
    state,
    subscribe(listener) {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
  };
  return <RealtimeContext value={value}>{children}</RealtimeContext>;
}

/** Calls `handler` for every realtime event (and `resync`) while the component is mounted. */
export function useRealtime(handler: Listener) {
  const context = use(RealtimeContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => context?.subscribe((signal) => latest.current(signal)), [context]);
}

export function useConnectionState(): ConnectionState {
  return use(RealtimeContext)?.state ?? "disconnected";
}
