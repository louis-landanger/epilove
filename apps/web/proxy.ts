import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_COOKIE,
  LOCALE_HEADER,
  localizedPath,
  negotiateLocale,
  splitLocalePrefix,
} from "@epilove/core";
import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";
import { isLocalizedPublicPath } from "./i18n/paths";

/** Pages that need a signed-in member (the app, onboarding, settings). */
const PROTECTED_PREFIXES = [
  "/compte/recours",
  "/compte/verifier",
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
    // Apple: artwork and 30-second previews of "Mon son du moment" (PRO-07).
    `img-src 'self' blob: data: ${media} https://*.mzstatic.com`.replaceAll(/\s+/g, " "),
    `media-src 'self' blob: ${media} https://*.apple.com`.replaceAll(/\s+/g, " "),
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
 * resolve the language (PLT-04, ADR 0012), redirect signed-out visitors away
 * from the app (the real session check happens in the layouts) and attach a
 * per-request CSP nonce.
 */
export function proxy(request: NextRequest) {
  const { search } = request.nextUrl;
  const requested = request.nextUrl.pathname;

  // French pages have no prefix: `/fr/legal/cgu` is `/legal/cgu`.
  if (requested === `/${DEFAULT_LOCALE}` || requested.startsWith(`/${DEFAULT_LOCALE}/`)) {
    const target = request.nextUrl.clone();
    target.pathname = requested.slice(DEFAULT_LOCALE.length + 1) || "/";
    return NextResponse.redirect(target, 308);
  }

  const { locale: prefixed, pathname } = splitLocalePrefix(requested);
  const chosen = request.cookies.get(LOCALE_COOKIE)?.value;
  const preferred = isLocale(chosen) ? chosen : negotiateLocale(request.headers.get("accept-language"));
  const isPublic = isLocalizedPublicPath(pathname);

  // Public pages have one URL per language: send English readers to theirs.
  if (!prefixed && isPublic && preferred !== DEFAULT_LOCALE) {
    const target = request.nextUrl.clone();
    target.pathname = localizedPath(preferred, pathname);
    const response = NextResponse.redirect(target, 307);
    response.headers.set("Vary", "Cookie, Accept-Language");
    return response;
  }
  const locale = prefixed ?? (isPublic ? DEFAULT_LOCALE : preferred);

  if (matches(pathname, PROTECTED_PREFIXES)) {
    const signedIn = Boolean(getSessionCookie(request, { cookiePrefix: "epilove" })) || hasDevMember(request);
    if (!signedIn) {
      const target = new URL(prefixed ? localizedPath(prefixed, "/connexion") : "/connexion", request.url);
      target.searchParams.set("suite", `${pathname}${search}`);
      return NextResponse.redirect(target);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(LOCALE_HEADER, locale);
  const nonce = matches(pathname, NONCE_PREFIXES) ? btoa(crypto.randomUUID()) : null;
  const policy = nonce ? contentSecurityPolicy(nonce) : null;
  if (nonce && policy) {
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("Content-Security-Policy", policy);
  }

  const response = prefixed
    ? NextResponse.rewrite(new URL(`${pathname}${search}`, request.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });
  if (policy) {
    response.headers.set("Content-Security-Policy", policy);
  }
  response.headers.set("Content-Language", locale);
  if (!prefixed && isPublic) {
    response.headers.set("Vary", "Cookie, Accept-Language");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico|woff2?)$).*)",
  ],
};
