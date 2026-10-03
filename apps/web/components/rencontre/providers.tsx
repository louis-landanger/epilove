"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { type ReactNode, useState } from "react";
import { RealtimeProvider } from "@/lib/rencontre/realtime";

/**
 * Client providers of the dating features: service worker registration (PWA,
 * push), one query cache per tab, animations that follow the system "reduce
 * motion" setting, and the realtime connection.
 */
export function RencontreProviders({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: true, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );
  return (
    <SerwistProvider swUrl="/serwist/sw.js">
      <QueryClientProvider client={client}>
        <MotionConfig reducedMotion="user">
          <RealtimeProvider>{children}</RealtimeProvider>
        </MotionConfig>
      </QueryClientProvider>
    </SerwistProvider>
  );
}
