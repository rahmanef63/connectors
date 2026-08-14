/* The seam between protocol and product.
 *
 * Everything above this line is the same for every consumer: the file contract,
 * the safe fetch, the verification. Everything below it is theirs: where bytes
 * live, what "attach" means, which resources exist. A consumer implements two
 * small interfaces and gets the whole ingestion path for free — and this
 * package never learns what a portfolio is. */
import { ConnectorError, newCorrelationId, toConnectorError } from "./errors.js";
import { ingestOpenAIFile, type IngestOptions, type NormalizedIncomingFile } from "./ingest.js";
import type { OpenAIFile } from "./schema.js";

/** A file after the consumer has persisted it. `url` is whatever the consumer
 *  serves publicly — prefer a stable path on its own origin over a storage
 *  provider's URL, which rots when the deployment is renamed. */
export interface StoredFile {
  id: string;
  url: string;
  mimeType: string;
  fileName: string;
  sizeBytes: number;
}

export interface FileStoreAdapter {
  save(input: NormalizedIncomingFile & { correlationId?: string }): Promise<StoredFile>;
}

/** What the consumer did with the file. `previous` exists so a caller can tell
 *  the user what was displaced, and so an "undo" is expressible — see the note
 *  on reversibility below. */
export interface AttachedMedia {
  resourceId: string;
  mediaId: string;
  usage: string;
  url: string;
  previous?: { mediaId: string; url: string } | null;
}

export interface MediaAttachAdapter {
  attach(input: {
    resourceId: string;
    media: StoredFile;
    usage: string;
    correlationId?: string;
  }): Promise<AttachedMedia>;
}

/**
 * Ingest, store, attach — the whole path behind one call.
 *
 * This is the primitive a consumer composes into a single user-goal tool
 * (`portfolio_attach_media`, `profile_set_avatar`). The model calls one tool
 * and never sees upload URLs, blob registration or storage ids.
 *
 * On reversibility: an adapter that returns `previous` has performed a
 * reversible pointer change and its tool should NOT be marked destructive. An
 * adapter that discards the prior asset has, and its tool should be. That is a
 * property of the adapter, not of this function, so it cannot be decided here
 * — which is exactly why `previous` is part of the interface.
 */
export async function receiveFileIntoMedia(args: {
  file: OpenAIFile;
  resourceId: string;
  usage: string;
  store: FileStoreAdapter;
  attach: MediaAttachAdapter;
  ingest: IngestOptions;
}): Promise<AttachedMedia> {
  const correlationId = args.ingest.correlationId ?? newCorrelationId();
  if (!args.resourceId) {
    throw new ConnectorError("invalid_input", "A target resource id is required.", { correlationId });
  }
  try {
    const normalized = await ingestOpenAIFile(args.file, { ...args.ingest, correlationId });
    const stored = await args.store.save({ ...normalized, correlationId });
    return await args.attach.attach({
      resourceId: args.resourceId,
      media: stored,
      usage: args.usage,
      correlationId,
    });
  } catch (e) {
    // A store or attach failure must not surface a driver message. toConnectorError
    // keeps the correlation id so the operator can find the real one in the log.
    throw toConnectorError(e, correlationId);
  }
}
