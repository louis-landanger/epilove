import { createSerwistRoute } from "@serwist/turbopack";

// Bundles service-worker/sw.ts (with the precache manifest) and serves it at /serwist/sw.js.
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "service-worker/sw.ts",
  useNativeEsbuild: true,
});
