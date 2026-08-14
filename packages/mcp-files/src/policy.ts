/* The safe-fetch policy for pulling bytes from a caller-supplied URL.
 *
 * A tool that accepts a file turns your backend into something that makes
 * outbound requests on behalf of whoever holds a token. This module exists so
 * that is an explicit, bounded policy rather than an accidental general-purpose
 * URL fetcher. */

/** Reasons a URL is refused. Stable strings — consumers may branch on them. */
export type UrlRejection =
  | "not-a-url"
  | "scheme-not-https"
  | "private-address"
  | "credentials-in-url"
  | "port-not-allowed";

export interface FetchPolicy {
  /** Accepted content types, lower-case, no parameters. */
  allowedMimeTypes: readonly string[];
  /** Hard ceiling on the decoded body, in bytes. */
  maxBytes: number;
  /** Whole-request budget, milliseconds. */
  timeoutMs: number;
  /** Redirect hops to follow. Each hop is re-validated. 0 refuses redirects. */
  maxRedirects: number;
  /** Non-default ports to permit. 443 is always allowed. */
  allowedPorts: readonly number[];
}

/** Images a portfolio or CMS would accept. SVG is deliberately absent: it is a
 *  document that can carry script, and nothing downstream renders it safely by
 *  default. Add it consciously or not at all. */
export const imagePolicy: FetchPolicy = {
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"],
  maxBytes: 10 * 1024 * 1024,
  timeoutMs: 15_000,
  maxRedirects: 3,
  allowedPorts: [],
};

export const documentPolicy: FetchPolicy = {
  ...imagePolicy,
  allowedMimeTypes: [...imagePolicy.allowedMimeTypes, "application/pdf"],
  maxBytes: 25 * 1024 * 1024,
};

const PRIVATE_V4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

/**
 * Hostname-level guard.
 *
 * KNOWN LIMIT, and the reason this is not the last line of defence: no DNS
 * resolution happens here, so a public name that resolves to a private address
 * still passes, and a name validated now can resolve differently at connect
 * time (DNS rebinding). Closing that needs an egress allowlist or a resolving
 * HTTP agent at the network layer, not more regex. Documented rather than
 * implied, so nobody mistakes this for complete.
 */
export function checkUrl(raw: string, policy: FetchPolicy): { ok: true; url: URL } | { ok: false; reason: UrlRejection } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "not-a-url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "scheme-not-https" };
  // user:pass@host is a classic way to make a hostile host look familiar
  if (url.username || url.password) return { ok: false, reason: "credentials-in-url" };
  if (url.port && url.port !== "443" && !policy.allowedPorts.includes(Number(url.port))) {
    return { ok: false, reason: "port-not-allowed" };
  }

  const h = url.hostname.toLowerCase();
  const bracketless = h.startsWith("[") && h.endsWith("]") ? h.slice(1, -1) : h;
  const isPrivate =
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal" ||
    PRIVATE_V4.test(h) ||
    bracketless === "::1" ||
    bracketless.startsWith("fd") ||
    bracketless.startsWith("fc") ||
    bracketless.startsWith("fe80");
  if (isPrivate) return { ok: false, reason: "private-address" };

  return { ok: true, url };
}

/* ── content sniffing ─────────────────────────────────────────────────────
   The declared content-type and the file name both come from the caller and
   neither is evidence. These signatures are. A body whose bytes disagree with
   its header is refused rather than trusted in either direction. */

const startsWith = (b: Uint8Array, sig: readonly number[], offset = 0): boolean =>
  sig.every((v, i) => b[offset + i] === v);

const ascii = (b: Uint8Array, offset: number, s: string): boolean =>
  [...s].every((c, i) => b[offset + i] === c.charCodeAt(0));

/** The true media type of a body, or null when unrecognised. */
export function sniffMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, "GIF8")) return "image/gif";
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return "image/webp";
  if (ascii(bytes, 4, "ftyp") && (ascii(bytes, 8, "avif") || ascii(bytes, 8, "avis"))) return "image/avif";
  if (ascii(bytes, 0, "%PDF")) return "application/pdf";
  return null;
}

/** Strip parameters and normalise: `image/PNG; charset=x` -> `image/png`. */
export const normalizeMime = (raw: string | null | undefined): string =>
  (raw ?? "").split(";")[0]!.trim().toLowerCase();

/** A file name safe to store and to put in a URL. Never reuse the caller's. */
export function safeFileName(declared: string | undefined, mime: string, fallback = "file"): string {
  const ext =
    { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "application/pdf": "pdf" }[
      mime
    ] ?? "bin";
  const base = (declared ?? "").split(/[\\/]/).pop() ?? "";
  const stem = base.replace(/\.[A-Za-z0-9]+$/, "");
  const safe = stem.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return `${safe || fallback}.${ext}`;
}
