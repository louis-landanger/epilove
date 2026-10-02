import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/** Pages that need a signed-in member (the app, onboarding, settings). */
const PROTECTED_PREFIXES = [
  "/onboarding",
  "/profil",
  "/reglages",
  "/decouvrir",
  "/likes",
  "/messages",
  "/membres",
  "/campus",
  "/notifications",
  "/aide",
];

/** Dynamic pages served with a nonce-based Content-Security-Policy. */
const NONCE_PREFIXES = [...PROTECTED_PREFIXES, "/connexion", "/compte"];

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function originOf(url: string | undefined) {
  if (!url) {
    return "";
  }
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function contentSecurityPolicy(nonce: string) {
  const development = process.env.NODE_ENV !== "production";
  const media = originOf(process.env.IMGPROXY_URL);
  const realtime = process.env.NEXT_PUBLIC_CENTRIFUGO_URL ?? "";
  // Photos are posted straight to object storage with a presigned form.
  const uploads = originOf(process.env.S3_PUBLIC_ENDPOINT || process.env.S3_ENDPOINT);
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data: ${media}`.trim(),
    `media-src 'self' blob: ${media}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${realtime} ${uploads}${development ? " ws: wss:" : ""}`
      .replaceAll(/\s+/g, " ")
      .trim(),
    "frame-src https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(development ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

function hasDevMember(request: NextRequest) {
  const allowed =
    process.env.DEV_AUTH === "1" && (process.env.APP_ENV === "development" || process.env.APP_ENV === "test");
  return allowed && Boolean(request.cookies.get("epilove_dev_user")?.value);
}

/**
 * Fast checks before rendering (docs/07-confiance-securite.md, part B):
 * redirect signed-out visitors away from the app (the real session check
 * happens in the layouts) and attach a per-request CSP nonce.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (matches(pathname, PROTECTED_PREFIXES)) {
    const signedIn = Boolean(getSessionCookie(request, { cookiePrefix: "epilove" })) || hasDevMember(request);
    if (!signedIn) {
      const target = new URL("/connexion", request.url);
      target.searchParams.set("suite", `${pathname}${search}`);
      return NextResponse.redirect(target);
    }
  }

  if (!matches(pathname, NONCE_PREFIXES)) {
    return NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const policy = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|woff2?)$).*)",
  ],
};
