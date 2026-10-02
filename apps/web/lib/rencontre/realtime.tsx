"use client";

import { type BroadcastChannel, parseRealtimeEvent, type RealtimeEvent } from "@epilove/realtime/events";
import type { Centrifuge, Subscription } from "centrifuge";
import { createContext, type ReactNode, use, useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api.client";

/**
 * Realtime connection (Centrifugo) for the signed-in member: one WebSocket per
 * tab, subscribed to the member's personal channel. Events only carry ids
 * (ADR 0020); screens refetch what they need through the API.
 *
 * After a reconnection, a `resync` signal tells screens to catch up through
 * the API, whether or not Centrifugo could replay the missed events.
 *
 * Campus-wide channels (the Pact reveal) are only subscribed while a screen
 * listens to them (`useBroadcast`): being subscribed is what the live
 * counter counts.
 */
export type RealtimeSignal = RealtimeEvent | { readonly type: "resync" };
type Listener = (signal: RealtimeSignal) => void;
export type ConnectionState = "connecting" | "connected" | "disconnected";

interface RealtimeContextValue {
  subscribe(listener: Listener): () => void;
  subscribeBroadcast(channel: BroadcastChannel, listener: Listener): () => void;
  readonly state: ConnectionState;
}

interface BroadcastEntry {
  readonly listeners: Set<Listener>;
  subscription: Subscription | null;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listeners = useRef(new Set<Listener>());
  const centrifuge = useRef<Centrifuge | null>(null);
  const broadcasts = useRef(new Map<BroadcastChannel, BroadcastEntry>());
  const [state, setState] = useState<ConnectionState>("connecting");

  const attach = useCallback((channel: BroadcastChannel, entry: BroadcastEntry) => {
    const client = centrifuge.current;
    if (!client || entry.subscription) {
      return;
    }
    const subscription = client.getSubscription(channel) ?? client.newSubscription(channel);
    let subscribedOnce = false;
    subscription.on("subscribed", () => {
      if (subscribedOnce) {
        for (const listener of entry.listeners) {
          listener({ type: "resync" });
        }
      }
      subscribedOnce = true;
    });
    subscription.on("publication", (ctx) => {
      const event = parseRealtimeEvent(ctx.data);
      if (event) {
        for (const listener of entry.listeners) {
          listener(event);
        }
      }
    });
    subscription.subscribe();
    entry.subscription = subscription;
  }, []);

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
        centrifuge.current = client;
        for (const [channel, entry] of broadcasts.current) {
          attach(channel, entry);
        }
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
          centrifuge.current = null;
          for (const entry of broadcasts.current.values()) {
            entry.subscription = null;
          }
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
  }, [attach]);

  const value: RealtimeContextValue = {
    state,
    subscribe(listener) {
      listeners.current.add(listener);
      return () => listeners.current.delete(listener);
    },
    subscribeBroadcast(channel, listener) {
      let entry = broadcasts.current.get(channel);
      if (!entry) {
        entry = { listeners: new Set(), subscription: null };
        broadcasts.current.set(channel, entry);
      }
      entry.listeners.add(listener);
      attach(channel, entry);
      return () => {
        const current = broadcasts.current.get(channel);
        current?.listeners.delete(listener);
        // Deferred: a re-render resubscribes right away, without leaving and rejoining the channel.
        queueMicrotask(() => {
          if (current && current.listeners.size === 0 && broadcasts.current.get(channel) === current) {
            if (current.subscription) {
              current.subscription.unsubscribe();
              current.subscription.removeAllListeners();
              centrifuge.current?.removeSubscription(current.subscription);
            }
            broadcasts.current.delete(channel);
          }
        });
      };
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

/** Listens to a campus-wide channel (subscribed only while a component uses it). */
export function useBroadcast(channel: BroadcastChannel, handler: Listener) {
  const context = use(RealtimeContext);
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(
    () => context?.subscribeBroadcast(channel, (signal) => latest.current(signal)),
    [context, channel],
  );
}

export function useConnectionState(): ConnectionState {
  return use(RealtimeContext)?.state ?? "disconnected";
}
