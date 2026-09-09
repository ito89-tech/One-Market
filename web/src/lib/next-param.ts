/**
 * Sanitises a `?next=` redirect target.
 *
 * Only same-site absolute paths are allowed, so the parameter cannot be used to
 * bounce someone to an external site after login. `//evil.com` is rejected too:
 * browsers read it as a protocol-relative URL.
 */
export function safeNext(value: string | undefined, fallback = "/mypage"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}
