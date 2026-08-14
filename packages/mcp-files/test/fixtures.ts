/* Byte fixtures and a scriptable fetch. Real signatures, because the whole
 * point of sniffing is that it looks at bytes. */

export const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR
]);

export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);

export const png = () => new Uint8Array(PNG);
export const jpeg = () => new Uint8Array(JPEG);

export interface FakeResponse {
  body?: Uint8Array;
  type?: string;
  status?: number;
  redirectTo?: string;
  /** Force a content-length that disagrees with the body. */
  lyingLength?: number;
}

/** A fetch that answers only from the script. An unlisted URL is a hard error,
 *  so a test can never silently reach the real network. */
export function fakeFetch(script: Record<string, FakeResponse>): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const spec = script[url];
    if (!spec) throw new Error(`fakeFetch: no scripted response for ${url}`);

    if (spec.redirectTo) {
      return new Response(null, { status: 302, headers: { location: spec.redirectTo } });
    }
    if (spec.status && spec.status >= 400) {
      return new Response("nope", { status: spec.status });
    }
    const body = spec.body ?? new Uint8Array(0);
    const headers = new Headers();
    if (spec.type) headers.set("content-type", spec.type);
    headers.set("content-length", String(spec.lyingLength ?? body.byteLength));
    // A zero-length body must still produce a readable stream, so pass the
    // buffer rather than null.
    // Uint8Array<ArrayBufferLike> vs BodyInit is a lib-typing mismatch, not a
    // runtime one; the DOM lib wants an ArrayBuffer-backed view.
    return new Response(body as unknown as BodyInit, { status: spec.status ?? 200, headers });
  }) as unknown as typeof fetch;
}
