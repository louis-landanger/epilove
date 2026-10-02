const IPV4 = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

/**
 * Client address for per-IP limits. Only a single, well-formed value is
 * trusted: a list means an untrusted hop was added (same rule as the auth
 * layer). Headers are configurable (`API_IP_HEADERS`, e.g. cf-connecting-ip).
 */
export function clientIp(headers: Headers, names: readonly string[] = ["x-forwarded-for"]): string | null {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value && !value.includes(",") && (IPV4.test(value) || IPV6.test(value))) {
      return value.toLowerCase();
    }
  }
  return null;
}
