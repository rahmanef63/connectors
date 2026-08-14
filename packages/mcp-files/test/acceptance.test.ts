/* The brief's acceptance test, expressed as code.
 *
 * "A ChatGPT-supported image can be supplied to a consumer's portfolio-media
 * operation through the official file-parameter contract without requiring the
 * model to manually orchestrate internal storage protocol."
 *
 * The consumer below is a stand-in for CareerPack: it implements the two
 * adapter interfaces and nothing else. If this passes, a real consumer needs
 * only to swap the two fakes for real storage. */
import { describe, expect, it, vi } from "vitest";
import {
  assertFileParamsConformant,
  fileParamsMeta,
  imagePolicy,
  openAIFileSchema,
  receiveFileIntoMedia,
  type AttachedMedia,
  type FileStoreAdapter,
  type MediaAttachAdapter,
  type StoredFile,
} from "../src/index.js";
import { fakeFetch, png } from "./fixtures.js";

/* ── what a consumer writes ───────────────────────────────────────────── */

// One user-goal tool. Not create_upload_url + upload_blob + register + attach.
const portfolioAttachMedia = {
  name: "portfolio_attach_media",
  description:
    "Attach an image to a portfolio entry and optionally make it the thumbnail. Use when the user wants a picture on a project. Do NOT use to change text.",
  inputSchema: {
    type: "object",
    properties: {
      item_id: { type: "string", description: "Id from portfolio_list." },
      file: openAIFileSchema(),
      usage: { type: "string", enum: ["thumbnail", "gallery", "attachment"] },
    },
    required: ["item_id", "file"],
    additionalProperties: false,
  },
  annotations: {
    title: "Attach media to a portfolio entry",
    readOnlyHint: false,
    idempotentHint: false,
    // The adapter below preserves what it displaces and returns `previous`,
    // so this is a reversible pointer change, not destruction.
    destructiveHint: false,
    // A portfolio page is publicly visible; changing its thumbnail changes
    // what the internet sees.
    openWorldHint: true,
  },
  _meta: fileParamsMeta(["file"]),
};

const blobs = new Map<string, { bytes: Uint8Array; mime: string }>();
const items = new Map<string, { thumbnailMediaId?: string; thumbnailUrl?: string }>([["item_42", {}]]);

const store: FileStoreAdapter = {
  async save(input): Promise<StoredFile> {
    const id = `media_${blobs.size + 1}`;
    blobs.set(id, { bytes: input.bytes, mime: input.mimeType });
    return { id, url: `/media/${id}`, mimeType: input.mimeType, fileName: input.fileName, sizeBytes: input.sizeBytes };
  },
};

const attach: MediaAttachAdapter = {
  async attach({ resourceId, media, usage }): Promise<AttachedMedia> {
    const item = items.get(resourceId);
    if (!item) throw new Error(`no such portfolio item: ${resourceId}`);
    const previous = item.thumbnailMediaId ? { mediaId: item.thumbnailMediaId, url: item.thumbnailUrl! } : null;
    if (usage === "thumbnail") {
      item.thumbnailMediaId = media.id;
      item.thumbnailUrl = media.url;
    }
    return { resourceId, mediaId: media.id, usage, url: media.url, previous };
  },
};

/* ── the test ─────────────────────────────────────────────────────────── */

describe("acceptance: ChatGPT image -> consumer portfolio media", () => {
  it("exposes a contract ChatGPT will accept", () => {
    expect(() => assertFileParamsConformant(portfolioAttachMedia)).not.toThrow();
  });

  it("carries a ChatGPT-generated image all the way onto a portfolio item in ONE tool call", async () => {
    // Exactly what ChatGPT sends: a temporary URL plus its own id. No upload
    // URL was minted, no blob was PUT, no storage id was passed by the model.
    const fromChatGPT = {
      download_url: "https://files.oaiusercontent.example/tmp/abc123",
      file_id: "file_abc123",
      mime_type: "image/png",
      file_name: "Comic Poster v1.png",
    };

    const result = await receiveFileIntoMedia({
      file: fromChatGPT,
      resourceId: "item_42",
      usage: "thumbnail",
      store,
      attach,
      ingest: {
        policy: imagePolicy,
        fetchImpl: fakeFetch({ "https://files.oaiusercontent.example/tmp/abc123": { body: png(), type: "image/png" } }),
      },
    });

    expect(result.mediaId).toBe("media_1");
    expect(result.usage).toBe("thumbnail");
    expect(result.url).toBe("/media/media_1");
    expect(items.get("item_42")!.thumbnailUrl).toBe("/media/media_1");
    expect(blobs.get("media_1")!.mime).toBe("image/png");
  });

  it("returns stable ids a follow-up call can reference", async () => {
    const r = await receiveFileIntoMedia({
      file: { download_url: "https://f.example/2", file_id: "file_2" },
      resourceId: "item_42",
      usage: "thumbnail",
      store,
      attach,
      ingest: { policy: imagePolicy, fetchImpl: fakeFetch({ "https://f.example/2": { body: png(), type: "image/png" } }) },
    });
    // The displaced thumbnail is reported, which is what makes this reversible
    // and therefore correctly NOT destructive.
    expect(r.previous).toEqual({ mediaId: "media_1", url: "/media/media_1" });
  });

  it("does not store anything when ingestion is refused", async () => {
    const before = blobs.size;
    const save = vi.spyOn(store, "save");
    await expect(
      receiveFileIntoMedia({
        file: { download_url: "https://169.254.169.254/creds", file_id: "file_x" },
        resourceId: "item_42",
        usage: "thumbnail",
        store,
        attach,
        ingest: { policy: imagePolicy, fetchImpl: fakeFetch({}) },
      }),
    ).rejects.toMatchObject({ code: "url_rejected" });
    expect(save).not.toHaveBeenCalled();
    expect(blobs.size).toBe(before);
    save.mockRestore();
  });

  it("maps a consumer-side failure to a safe error with a correlation id", async () => {
    const err = await receiveFileIntoMedia({
      file: { download_url: "https://f.example/3", file_id: "file_3" },
      resourceId: "item_does_not_exist",
      usage: "thumbnail",
      store,
      attach,
      ingest: { policy: imagePolicy, fetchImpl: fakeFetch({ "https://f.example/3": { body: png(), type: "image/png" } }) },
    }).catch((e) => e);

    expect(err.code).toBe("internal");
    // the adapter's raw message named an internal id; the public shape must not
    expect(JSON.stringify(err.toPublic())).not.toContain("item_does_not_exist");
    expect(err.toPublic().correlation_id).toMatch(/^c_/);
  });
});
