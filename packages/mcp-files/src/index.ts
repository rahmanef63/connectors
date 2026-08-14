/* @rahmanef/mcp-files — the shared OpenAI file-input contract for MCP tools.
 *
 * Protocol concerns only. Nothing here knows what a portfolio, a CV or a
 * workspace is; consumers supply that through the two adapter interfaces. */
export {
  openAIFileSchema,
  openAIFileArraySchema,
  fileParamsMeta,
  isConformantFileObject,
  assertFileParamsConformant,
  type OpenAIFile,
  type JsonSchema,
} from "./schema.js";

export {
  imagePolicy,
  documentPolicy,
  checkUrl,
  sniffMime,
  normalizeMime,
  safeFileName,
  type FetchPolicy,
  type UrlRejection,
} from "./policy.js";

export { ingestOpenAIFile, type NormalizedIncomingFile, type IngestOptions } from "./ingest.js";

export {
  receiveFileIntoMedia,
  type FileStoreAdapter,
  type MediaAttachAdapter,
  type StoredFile,
  type AttachedMedia,
} from "./adapters.js";

export {
  ConnectorError,
  toConnectorError,
  newCorrelationId,
  type ConnectorErrorCode,
  type FieldError,
} from "./errors.js";
