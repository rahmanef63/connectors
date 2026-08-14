/* The security surface. If any of these regress, the file tool becomes an
 * open request proxy or a way to smuggle a payload past a type check. */
import { describe, expect, it } from "vitest";
import { checkUrl, imagePolicy, safeFileName, sniffMime } from "../src/policy.js";
import { ingestOpenAIFile } from "../src/ingest.js";
import { ConnectorError } from "../src/errors.js";
import { PNG, fakeFetch, jpeg, png } from "./fixtures.js";

describe("checkUrl", () => {
  const reject = (u: string) => {
    const r = checkUrl(u, imagePolicy);
    expect(r.ok, `${u} should be rejected`).toBe(false);
    return r.ok ? "" : r.reason;
  };

  it("accepts an ordinary https URL", () => {
    expect(checkUrl("https://files.example.com/a.png", imagePolicy).ok).toBe(true);
  });

  it("refuses non-https schemes", () => {
    expect(reject("http://example.com/a.png")).toBe("scheme-not-https");
    expect(reject("file:///etc/passwd")).toBe("scheme-not-https");
    expect(reject("gopher://example.com/")).toBe("scheme-not-https");
  });

  it("refuses the cloud metadata endpoint", () => {
    expect(reject("https://169.254.169.254/latest/meta-data/iam/security-credentials/")).toBe("private-address");
    expect(reject("https://metadata.google.internal/computeMetadata/v1/")).toBe("private-address");
  });

  it("refuses loopback, RFC1918, link-local and carrier-grade NAT", () => {
    for (const h of [
      "localhost", "127.0.0.1", "10.1.2.3", "192.168.0.1",
      "172.16.0.1", "172.31.255.255", "0.0.0.0", "100.64.0.1",
      "svc.internal", "printer.local",
    ]) {
      expect(reject(`https://${h}/x.png`), h).toBe("private-address");
    }
  });

  it("does not over-block public addresses that merely look similar", () => {
    for (const h of ["172.32.0.1", "11.0.0.1", "100.128.0.1", "notlocalhost.com"]) {
      expect(checkUrl(`https://${h}/x.png`, imagePolicy).ok, h).toBe(true);
    }
  });

  it("refuses IPv6 loopback and unique-local", () => {
    expect(reject("https://[::1]/x.png")).toBe("private-address");
    expect(reject("https://[fd00::1]/x.png")).toBe("private-address");
    expect(reject("https://[fe80::1]/x.png")).toBe("private-address");
  });

  it("refuses credentials embedded in the URL", () => {
    expect(reject("https://user:pass@evil.example.com/x.png")).toBe("credentials-in-url");
  });

  it("refuses a non-443 port unless the policy allows it", () => {
    expect(reject("https://example.com:8080/x.png")).toBe("port-not-allowed");
    expect(checkUrl("https://example.com:8080/x.png", { ...imagePolicy, allowedPorts: [8080] }).ok).toBe(true);
  });
});

describe("sniffMime", () => {
  it("identifies real signatures", () => {
    expect(sniffMime(png())).toBe("image/png");
    expect(sniffMime(jpeg())).toBe("image/jpeg");
    expect(sniffMime(new TextEncoder().encode("GIF89a" + "x".repeat(20)))).toBe("image/gif");
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7" + "x".repeat(20)))).toBe("application/pdf");
  });

  it("returns null for a body that is not a known type", () => {
    expect(sniffMime(new TextEncoder().encode("<html><body>hi</body></html>"))).toBeNull();
    expect(sniffMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe("safeFileName", () => {
  it("re-derives the extension from the verified type, not the claim", () => {
    expect(safeFileName("evil.php", "image/png")).toBe("evil.png");
  });
  it("strips path traversal", () => {
    expect(safeFileName("../../../etc/passwd", "image/png")).toBe("passwd.png");
    expect(safeFileName("C:\\windows\\system32\\x.png", "image/png")).toBe("x.png");
  });
  it("survives a hostile or empty name", () => {
    expect(safeFileName("", "image/png")).toBe("file.png");
    expect(safeFileName("../".repeat(50), "image/png")).toBe("file.png");
    expect(safeFileName("a".repeat(500), "image/png")).toBe(`${"a".repeat(60)}.png`);
  });
});

describe("ingestOpenAIFile — SSRF and payload guards", () => {
  const file = { download_url: "https://files.example.com/a.png", file_id: "file_1" };
  const ingest = (fetchImpl: typeof fetch, policy = imagePolicy) =>
    ingestOpenAIFile(file, { policy, fetchImpl, correlationId: "c_test" });

  it("accepts a well-formed image", async () => {
    const out = await ingest(fakeFetch({ "https://files.example.com/a.png": { body: png(), type: "image/png" } }));
    expect(out.mimeType).toBe("image/png");
    expect(out.sizeBytes).toBe(PNG.length);
    expect(out.sourceFileId).toBe("file_1");
  });

  it("NEVER returns the download URL — it must not reach storage", async () => {
    const out = await ingest(fakeFetch({ "https://files.example.com/a.png": { body: png(), type: "image/png" } }));
    expect(JSON.stringify({ ...out, bytes: undefined })).not.toContain("files.example.com");
    expect(Object.keys(out)).not.toContain("download_url");
  });

  it("blocks a redirect INTO private space — the whole attack", async () => {
    const f = fakeFetch({
      "https://files.example.com/a.png": { redirectTo: "https://169.254.169.254/latest/meta-data/" },
      "https://169.254.169.254/latest/meta-data/": { body: png(), type: "image/png" },
    });
    await expect(ingest(f)).rejects.toMatchObject({ code: "url_rejected" });
  });

  it("re-validates every hop, not just the first", async () => {
    const f = fakeFetch({
      "https://files.example.com/a.png": { redirectTo: "https://cdn.example.com/b.png" },
      "https://cdn.example.com/b.png": { redirectTo: "https://127.0.0.1/c.png" },
      "https://127.0.0.1/c.png": { body: png(), type: "image/png" },
    });
    await expect(ingest(f)).rejects.toMatchObject({ code: "url_rejected" });
  });

  it("stops at the redirect limit instead of looping", async () => {
    const f = fakeFetch({ "https://files.example.com/a.png": { redirectTo: "https://files.example.com/a.png" } });
    await expect(ingest(f)).rejects.toThrow(/redirected too many times/);
  });

  it("enforces the cap on REAL bytes when content-length lies", async () => {
    const big = new Uint8Array(1024 * 64);
    big.set(PNG);
    const f = fakeFetch({ "https://files.example.com/a.png": { body: big, type: "image/png", lyingLength: 10 } });
    await expect(ingest(f, { ...imagePolicy, maxBytes: 1024 })).rejects.toMatchObject({ code: "payload_too_large" });
  });

  it("rejects an honest oversized declaration early", async () => {
    const f = fakeFetch({ "https://files.example.com/a.png": { body: png(), type: "image/png", lyingLength: 99_000_000 } });
    await expect(ingest(f)).rejects.toMatchObject({ code: "payload_too_large" });
  });

  it("rejects HTML dressed as an image", async () => {
    const f = fakeFetch({
      "https://files.example.com/a.png": { body: new TextEncoder().encode("<html>gotcha</html>"), type: "image/png" },
    });
    await expect(ingest(f)).rejects.toMatchObject({ code: "unsupported_media_type" });
  });

  it("rejects a body whose content contradicts its own header", async () => {
    const f = fakeFetch({ "https://files.example.com/a.png": { body: jpeg(), type: "image/png" } });
    await expect(ingest(f)).rejects.toThrow(/do not match the type it claims/);
  });

  it("rejects a type outside the policy even when it is a real file", async () => {
    const f = fakeFetch({
      "https://files.example.com/a.png": { body: new TextEncoder().encode("%PDF-1.7" + "x".repeat(20)), type: "application/pdf" },
    });
    await expect(ingest(f)).rejects.toMatchObject({ code: "unsupported_media_type" });
  });

  it("explains an expired temporary URL in words the user can act on", async () => {
    const f = fakeFetch({ "https://files.example.com/a.png": { status: 403 } });
    await expect(ingest(f)).rejects.toThrow(/temporary link may have expired/);
  });

  it("refuses an empty body", async () => {
    const f = fakeFetch({ "https://files.example.com/a.png": { body: new Uint8Array(0), type: "image/png" } });
    await expect(ingest(f)).rejects.toMatchObject({ code: "upstream_unavailable" });
  });

  it("rejects a file reference missing its required fields", async () => {
    await expect(
      ingestOpenAIFile({ download_url: "", file_id: "" }, { policy: imagePolicy, fetchImpl: fakeFetch({}) }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("never leaks internals into the public error shape", async () => {
    const boom = (() => Promise.reject(new Error("ECONNREFUSED 10.0.0.5:5432 pg://user:hunter2@db"))) as unknown as typeof fetch;
    const err: ConnectorError = await ingest(boom).then(
      () => { throw new Error("expected ingest to reject"); },
      (e: unknown) => e as ConnectorError,
    );
    const pub = JSON.stringify(err.toPublic());
    expect(pub).not.toContain("hunter2");
    expect(pub).not.toContain("10.0.0.5");
    expect(err.correlationId).toBe("c_test");
  });
});
