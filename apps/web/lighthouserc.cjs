// Lighthouse CI (palier 3): blocking budgets on the public pages, measured on
// the production build with Lighthouse's default mobile emulation and throttling.
const port = process.env.LHCI_PORT ?? "3200";
const base = `http://127.0.0.1:${port}`;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `pnpm start --port ${port}`,
      startServerReadyPattern: "Ready in",
      url: [`${base}/`, `${base}/en`, `${base}/legal/confidentialite`, `${base}/connexion`],
      numberOfRuns: Number(process.env.LHCI_RUNS ?? 3),
      chromePath: process.env.PW_CHROMIUM_PATH || undefined,
      settings: {
        chromeFlags: "--no-sandbox --headless=new",
        // Measure the French pages: the proxy sends English browsers to /en.
        extraHeaders: JSON.stringify({ "Accept-Language": "fr-FR,fr;q=0.9" }),
        // The site is deliberately not indexable before launch (robots: noindex).
        skipAudits: ["is-crawlable"],
      },
    },
    // Blocking budgets set just above the measured state (docs/integration/session-a.md
    // gives the measurements and the targets): any regression fails the build.
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: ".*",
          assertions: {
            "categories:accessibility": ["error", { minScore: 1, aggregationMethod: "median" }],
            "categories:best-practices": ["error", { minScore: 0.95, aggregationMethod: "median" }],
            "cumulative-layout-shift": ["error", { maxNumericValue: 0.05, aggregationMethod: "median" }],
          },
        },
        {
          // Landing, French and English.
          matchingUrlPattern: "^http://[^/]+/(en)?$",
          assertions: {
            "categories:performance": ["error", { minScore: 0.6, aggregationMethod: "median" }],
            "largest-contentful-paint": ["error", { maxNumericValue: 6000, aggregationMethod: "median" }],
            "total-blocking-time": ["error", { maxNumericValue: 600, aggregationMethod: "median" }],
            "resource-summary:script:size": ["error", { maxNumericValue: 380 * 1024 }],
            "resource-summary:font:size": ["error", { maxNumericValue: 270 * 1024 }],
            "resource-summary:total:size": ["error", { maxNumericValue: 750 * 1024 }],
          },
        },
        {
          matchingUrlPattern: "/(connexion|legal/.+)$",
          assertions: {
            "categories:performance": ["error", { minScore: 0.8, aggregationMethod: "median" }],
            "largest-contentful-paint": ["error", { maxNumericValue: 4200, aggregationMethod: "median" }],
            "total-blocking-time": ["error", { maxNumericValue: 400, aggregationMethod: "median" }],
            "resource-summary:script:size": ["error", { maxNumericValue: 330 * 1024 }],
            "resource-summary:font:size": ["error", { maxNumericValue: 110 * 1024 }],
          },
        },
      ],
    },
    upload: { target: "filesystem", outputDir: ".lighthouseci/reports" },
  },
};
