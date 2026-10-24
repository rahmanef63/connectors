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

/** Eight hextets, or null when the text is not a plain IPv6 literal. The URL
 *  parser has already canonicalised the address, so no dotted quad can appear
 *  inside the brackets and no group needs re-encoding. */
const expandV6 = (address: string): number[] | null => {
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const half = (part: string): number[] | null => {
    if (part === "") return [];
    const groups: number[] = [];
    for (const group of part.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      groups.push(parseInt(group, 16));
    }
    return groups;
  };
  const head = half(halves[0]!);
  const tail = halves.length === 1 ? [] : half(halves[1]!);
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  if (fill < 1) return null;
  return [...head, ...Array<number>(fill).fill(0), ...tail];
};

/**
 * Every IPv4 address an IPv6 literal can smuggle, as dotted quads.
 *
 * The mapped form (`::ffff:7f00:1`) is the famous one but not the only one:
 * IPv4-compatible (`::7f00:1`), IPv4-translated (`::ffff:0:7f00:1`), the NAT64
 * well-known prefix (`64:ff9b::7f00:1`, and `64:ff9b:1::/48`) and 6to4
 * (`2002:7f00:1::`) all reach the same host on a network that translates them.
 * A guard that only knows `::ffff:` waves the rest through.
 */
const embeddedV4 = (g: readonly number[]): string[] => {
  const quad = (hi: number, lo: number): string => `${hi >>> 8}.${hi & 255}.${lo >>> 8}.${lo & 255}`;
  const zeroes = (from: number, to: number): boolean => g.slice(from, to).every((x) => x === 0);
  const out: string[] = [];
  // ::/96 IPv4-compatible, and ::ffff:0:0/96 IPv4-mapped.
  if (zeroes(0, 5) && (g[5] === 0 || g[5] === 0xffff)) out.push(quad(g[6]!, g[7]!));
  // ::ffff:0:0/96 IPv4-translated (SIIT).
  if (zeroes(0, 4) && g[4] === 0xffff && g[5] === 0) out.push(quad(g[6]!, g[7]!));
  // 64:ff9b::/96 and 64:ff9b:1::/48 NAT64.
  if (g[0] === 0x64 && g[1] === 0xff9b && (zeroes(2, 6) || (g[2] === 1 && zeroes(3, 6)))) {
    out.push(quad(g[6]!, g[7]!));
  }
  // 2002::/16 6to4 — the embedded address is the 32 bits after the prefix.
  if (g[0] === 0x2002) out.push(quad(g[1]!, g[2]!));
  return out;
};

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

  const h = url.hostname.toLowerCase().replace(/\.$/, "");
  const isV6 = h.startsWith("[") && h.endsWith("]");
  const g = isV6 ? expandV6(h.slice(1, -1)) : null;
  const smuggled = g ? embeddedV4(g) : [];
  const isPrivate =
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal") ||
    h === "metadata.google.internal" ||
    PRIVATE_V4.test(h) ||
    (g !== null && (
      g.every((x) => x === 0) ||
      /^f[cd]/.test(g[0]!.toString(16).padStart(4, "0")) ||
      /^fe[89ab]/.test(g[0]!.toString(16).padStart(4, "0")) ||
      smuggled.some((address) => PRIVATE_V4.test(address))
    ));
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
