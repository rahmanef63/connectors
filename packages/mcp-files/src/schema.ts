/* The OpenAI file-input contract, as a reusable schema builder.
 *
 * Consumers must never hand-write this shape. ChatGPT's Scan Tools step and
 * plugin submission reject a file schema that omits any of the four
 * properties, does not require exactly `download_url` and `file_id`, or marks
 * an optional property as required — and nothing fails locally when it drifts,
 * so the tool just silently stops being offered a file.
 *
 * Source: developers.openai.com/plugins/reference (Files), checked 2026-08-14.
 */

/** What ChatGPT actually sends. `mime_type` and `file_name` are declared in the
 *  schema but may be absent at runtime, so both are optional here too. */
export interface OpenAIFile {
  download_url: string;
  file_id: string;
  mime_type?: string;
  file_name?: string;
}

/** A JSON Schema fragment. Deliberately loose — consumers merge these into
 *  whatever their own tool definition looks like. */
export type JsonSchema = Record<string, unknown>;

const FILE_OBJECT: JsonSchema = {
  type: "object",
  properties: {
    download_url: { type: "string", description: "Temporary URL the server fetches the bytes from." },
    file_id: { type: "string", description: "Host-side identifier for the file." },
    mime_type: { type: "string", description: "Declared content type. Advisory only." },
    file_name: { type: "string", description: "Declared file name. Advisory only." },
  },
  required: ["download_url", "file_id"],
  additionalProperties: false,
};

/* A JSON round-trip rather than structuredClone: the latter is absent from
   some MCP host runtimes, Convex's V8 isolate among them, and a schema literal
   holds nothing a JSON clone cannot carry. */
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/* Inlined on purpose, never `$defs` + `$ref`.
 *
 * The published OpenAI example uses `$defs`. That form is equivalent JSON
 * Schema, but Convex refuses to encode ANY key beginning with `$` — returning
 * such a descriptor throws `Field name $defs starts with a '$', which is
 * reserved` and takes down the whole of `tools/list`, not just the tool with
 * the file input. Inlining costs nothing and works on every backend. */
export const openAIFileSchema = (): JsonSchema => clone(FILE_OBJECT);

/** An array of files, for tools that accept several at once. */
export const openAIFileArraySchema = (opts: { minItems?: number; maxItems?: number } = {}): JsonSchema => ({
  type: "array",
  items: clone(FILE_OBJECT),
  ...(opts.minItems === undefined ? {} : { minItems: opts.minItems }),
  ...(opts.maxItems === undefined ? {} : { maxItems: opts.maxItems }),
});

/** The `_meta` block naming which top-level fields carry files. Merge into the
 *  tool descriptor. Inert to every non-OpenAI host, which is why one tool can
 *  serve them all — Claude Code and Cursor just see an object with a
 *  `download_url` and can put any public URL in it. */
export const fileParamsMeta = (fields: readonly string[]): { "openai/fileParams": string[] } => {
  if (fields.length === 0) throw new Error("fileParamsMeta: name at least one field");
  return { "openai/fileParams": [...fields] };
};

/** Structural check that a schema conforms to the file contract. Exported so
 *  consumers can assert it in their own contract tests without re-deriving the
 *  rules — see `assertFileParamsConformant` for the whole-descriptor version. */
export function isConformantFileObject(schema: unknown): boolean {
  if (!schema || typeof schema !== "object") return false;
  const s = schema as { type?: unknown; properties?: Record<string, unknown>; required?: unknown };
  if (s.type !== "object" || !s.properties) return false;
  const props = Object.keys(s.properties).sort();
  if (props.join(",") !== "download_url,file_id,file_name,mime_type") return false;
  if (!Array.isArray(s.required)) return false;
  return [...s.required].sort().join(",") === "download_url,file_id";
}

/** Validate a whole tool descriptor: every field named in
 *  `_meta["openai/fileParams"]` must exist and be a conformant file object, or
 *  an array whose `items` is one. Throws with the offending path. */
export function assertFileParamsConformant(tool: {
  name?: string;
  inputSchema?: unknown;
  _meta?: Record<string, unknown>;
}): void {
  const fields = tool._meta?.["openai/fileParams"];
  if (!fields) return;
  const label = tool.name ?? "<unnamed tool>";
  if (!Array.isArray(fields)) throw new Error(`${label}: openai/fileParams must be an array`);

  const schema = tool.inputSchema as { properties?: Record<string, unknown> } | undefined;
  const props = schema?.properties;
  if (!props) throw new Error(`${label}: declares fileParams but has no inputSchema.properties`);

  for (const field of fields) {
    const node = props[field as string] as { type?: unknown; items?: unknown } | undefined;
    if (!node) throw new Error(`${label}.${field}: named in fileParams but absent from properties`);
    const target = node.type === "array" ? node.items : node;
    if (!isConformantFileObject(target)) {
      throw new Error(
        `${label}.${field}: not a conformant file object — declare exactly ` +
          `download_url, file_id, mime_type, file_name and require only the first two`,
      );
    }
  }

  // A `$`-prefixed key anywhere is fatal on Convex; catch it here rather than
  // at the first client call.
  const walk = (node: unknown, path: string): void => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
    for (const [k, v] of Object.entries(node)) {
      if (k.startsWith("$")) throw new Error(`${label}: ${path}.${k} — keys starting with "$" break Convex encoding`);
      walk(v, `${path}.${k}`);
    }
  };
  walk(tool.inputSchema, "inputSchema");
}
