/* Turn an OpenAIFile reference into verified bytes.
 *
 * Order matters and is not negotiable: the CALLER IS AUTHORIZED BEFORE THIS
 * FUNCTION IS CALLED. Nothing here checks permissions, because by the time a
 * URL is being fetched it is already too late — an unauthenticated caller must
 * never be able to make the backend emit an outbound request at all. Consumers
 * enforce that; this module refuses to be the place it is remembered. */
import { ConnectorError } from "./errors.js";
import type { OpenAIFile } from "./schema.js";
import { checkUrl, normalizeMime, safeFileName, sniffMime, type FetchPolicy, type UrlRejection } from "./policy.js";

/** Bytes plus the metadata we actually verified. Note what is NOT here: the
 *  download URL. It is short-lived and host-owned, so persisting it produces a
 *  column full of dead links and a needless secret at rest. */
export interface NormalizedIncomingFile {
  bytes: Uint8Array;
  /** Sniffed from content, not copied from the header. */
  mimeType: string;
  /** Re-derived server-side; never the caller's string. */
  fileName: string;
  sizeBytes: number;
  /** The host's opaque id, safe to keep for provenance. */
  sourceFileId: string;
}

const REJECTION_MESSAGE: Record<UrlRejection, string> = {
  "not-a-url": "The file location is not a valid URL.",
  "scheme-not-https": "Only https file locations are accepted.",
  "private-address": "That file location points at a private network address.",
  "credentials-in-url": "File locations must not embed credentials.",
  "port-not-allowed": "That file location uses a port this server does not fetch from.",
};

export interface IngestOptions {
  policy: FetchPolicy;
  correlationId?: string;
  /** Injectable for tests and for runtimes with a non-global fetch. */
  fetchImpl?: typeof fetch;
}

/**
 * Fetch and verify. Throws {@link ConnectorError} and nothing else.
 *
 * Redirects are followed MANUALLY and every hop is re-validated. Handing
 * `redirect: "follow"` to fetch would let an allowed host bounce the request
 * to `169.254.169.254`, which is the whole attack.
 */
export async function ingestOpenAIFile(file: OpenAIFile, opts: IngestOptions): Promise<NormalizedIncomingFile> {
  const { policy, correlationId } = opts;
  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  if (!file?.download_url || !file?.file_id) {
    throw new ConnectorError("invalid_input", "The file is missing download_url or file_id.", { correlationId });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
  try {
    let target = file.download_url;
    let res: Response | undefined;

    for (let hop = 0; ; hop++) {
      const checked = checkUrl(target, policy);
      if (!checked.ok) {
        throw new ConnectorError("url_rejected", REJECTION_MESSAGE[checked.reason], { correlationId });
      }
      res = await doFetch(checked.url.toString(), { redirect: "manual", signal: controller.signal });

      if (res.status >= 300 && res.status < 400) {
        if (hop >= policy.maxRedirects) {
          throw new ConnectorError("url_rejected", "The file location redirected too many times.", { correlationId });
        }
        const loc = res.headers.get("location");
        if (!loc) throw new ConnectorError("upstream_unavailable", "The file location redirected without a target.", { correlationId });
        target = new URL(loc, checked.url).toString(); // resolve relative, then re-validate at the top
        continue;
      }
      break;
    }

    if (!res!.ok) {
      // 4xx here is usually an expired temporary URL, which the user can fix by
      // re-attaching. Say that rather than echoing an upstream status.
      throw new ConnectorError(
        res!.status >= 500 ? "upstream_unavailable" : "url_rejected",
        res!.status === 404 || res!.status === 403
          ? "The file could not be downloaded — its temporary link may have expired. Attach it again."
          : `The file could not be downloaded (status ${res!.status}).`,
        { correlationId },
      );
    }

    // Cheap early rejection. The header is advisory and often absent or wrong,
    // so the real cap is enforced on the bytes below.
    const declaredLength = Number(res!.headers.get("content-length") ?? 0);
    if (declaredLength > policy.maxBytes) {
      throw new ConnectorError("payload_too_large", tooLarge(declaredLength, policy.maxBytes), { correlationId });
    }

    const bytes = await readCapped(res!, policy.maxBytes, correlationId);
    if (bytes.byteLength === 0) {
      throw new ConnectorError("upstream_unavailable", "The file location returned an empty body.", { correlationId });
    }

    const sniffed = sniffMime(bytes);
    if (!sniffed) {
      throw new ConnectorError("unsupported_media_type", "That file type is not recognised.", { correlationId });
    }
    if (!policy.allowedMimeTypes.includes(sniffed)) {
      throw new ConnectorError(
        "unsupported_media_type",
        `${sniffed} is not an accepted file type here. Accepted: ${policy.allowedMimeTypes.join(", ")}.`,
        { correlationId },
      );
    }
    // A body whose content disagrees with its own header is refused outright.
    // Either side could be the lie, so trusting either one is the bug.
    const declaredMime = normalizeMime(res!.headers.get("content-type"));
    if (declaredMime && declaredMime !== sniffed && policy.allowedMimeTypes.includes(declaredMime)) {
      throw new ConnectorError(
        "unsupported_media_type",
        "The file's contents do not match the type it claims to be.",
        { correlationId },
      );
    }

    return {
      bytes,
      mimeType: sniffed,
      fileName: safeFileName(file.file_name, sniffed),
      sizeBytes: bytes.byteLength,
      sourceFileId: file.file_id,
    };
  } catch (e) {
    if (e instanceof ConnectorError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new ConnectorError("timeout", "Downloading the file took too long.", { correlationId, internal: e });
    }
    throw new ConnectorError("upstream_unavailable", "The file could not be downloaded.", { correlationId, internal: e });
  } finally {
    clearTimeout(timer);
  }
}

const tooLarge = (got: number, max: number) =>
  `The file is ${(got / 1048576).toFixed(1)}MB; the limit is ${(max / 1048576).toFixed(0)}MB.`;

/** Read the body, aborting as soon as the cap is passed rather than buffering
 *  a hostile response first and measuring it afterwards. */
async function readCapped(res: Response, maxBytes: number, correlationId?: string): Promise<Uint8Array> {
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new ConnectorError("payload_too_large", tooLarge(buf.byteLength, maxBytes), { correlationId });
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new ConnectorError("payload_too_large", tooLarge(total, maxBytes), { correlationId });
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}
