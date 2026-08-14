import { describe, expect, it } from "vitest";
import {
  assertFileParamsConformant,
  fileParamsMeta,
  isConformantFileObject,
  openAIFileArraySchema,
  openAIFileSchema,
} from "../src/schema.js";

describe("openAIFileSchema", () => {
  it("declares all four properties and requires exactly two", () => {
    const s = openAIFileSchema() as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(s.properties).sort()).toEqual(["download_url", "file_id", "file_name", "mime_type"]);
    expect([...s.required].sort()).toEqual(["download_url", "file_id"]);
  });

  it("never requires mime_type or file_name — ChatGPT may omit both", () => {
    const s = openAIFileSchema() as { required: string[] };
    expect(s.required).not.toContain("mime_type");
    expect(s.required).not.toContain("file_name");
  });

  it("returns a fresh object so a caller cannot mutate the shared shape", () => {
    const a = openAIFileSchema() as { required: string[] };
    a.required.push("mime_type");
    expect((openAIFileSchema() as { required: string[] }).required).toEqual(["download_url", "file_id"]);
  });

  it("uses no $-prefixed key — that form is fatal on Convex", () => {
    expect(JSON.stringify(openAIFileSchema())).not.toContain("$");
  });
});

describe("openAIFileArraySchema", () => {
  it("wraps the same conformant object in items", () => {
    const s = openAIFileArraySchema({ maxItems: 4 }) as { type: string; items: unknown; maxItems: number };
    expect(s.type).toBe("array");
    expect(s.maxItems).toBe(4);
    expect(isConformantFileObject(s.items)).toBe(true);
  });
});

describe("fileParamsMeta", () => {
  it("produces the openai/fileParams key", () => {
    expect(fileParamsMeta(["file"])).toEqual({ "openai/fileParams": ["file"] });
  });
  it("refuses an empty list rather than emitting a meaningless key", () => {
    expect(() => fileParamsMeta([])).toThrow();
  });
});

describe("assertFileParamsConformant", () => {
  const good = {
    name: "portfolio_attach_media",
    inputSchema: { type: "object", properties: { file: openAIFileSchema(), item_id: { type: "string" } }, required: ["file", "item_id"] },
    _meta: fileParamsMeta(["file"]),
  };

  it("passes a correct descriptor", () => {
    expect(() => assertFileParamsConformant(good)).not.toThrow();
  });

  it("passes an array file field", () => {
    expect(() =>
      assertFileParamsConformant({
        name: "t",
        inputSchema: { type: "object", properties: { files: openAIFileArraySchema() } },
        _meta: fileParamsMeta(["files"]),
      }),
    ).not.toThrow();
  });

  it("ignores a tool that declares no file params", () => {
    expect(() => assertFileParamsConformant({ name: "t", inputSchema: { type: "object", properties: {} } })).not.toThrow();
  });

  it("catches a field named in fileParams but missing from properties", () => {
    expect(() =>
      assertFileParamsConformant({ name: "t", inputSchema: { type: "object", properties: {} }, _meta: fileParamsMeta(["file"]) }),
    ).toThrow(/absent from properties/);
  });

  it("catches a missing optional property — declaring all four is mandatory", () => {
    const bad = openAIFileSchema() as { properties: Record<string, unknown> };
    delete bad.properties.file_name;
    expect(() =>
      assertFileParamsConformant({ name: "t", inputSchema: { type: "object", properties: { file: bad } }, _meta: fileParamsMeta(["file"]) }),
    ).toThrow(/not a conformant file object/);
  });

  it("catches over-requiring — mime_type must not be required", () => {
    const bad = openAIFileSchema() as { required: string[] };
    bad.required.push("mime_type");
    expect(() =>
      assertFileParamsConformant({ name: "t", inputSchema: { type: "object", properties: { file: bad } }, _meta: fileParamsMeta(["file"]) }),
    ).toThrow(/not a conformant file object/);
  });

  it("catches the $defs form the OpenAI docs show, because Convex rejects it", () => {
    expect(() =>
      assertFileParamsConformant({
        name: "t",
        inputSchema: {
          type: "object",
          $defs: { OpenAIFile: openAIFileSchema() },
          properties: { file: openAIFileSchema() },
        },
        _meta: fileParamsMeta(["file"]),
      }),
    ).toThrow(/\$defs/);
  });
});
