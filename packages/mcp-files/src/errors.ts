/* One error shape for every connector, machine-actionable and safe to show.
 *
 * The rule this enforces: what reaches the model is a sentence plus a code it
 * can branch on. What never reaches the model is a stack, a query, a host name,
 * a token, or a signed URL. */

export type ConnectorErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "insufficient_scope"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "unsupported_media_type"
  | "url_rejected"
  | "upstream_unavailable"
  | "timeout"
  | "rate_limited"
  | "internal";

/** Codes where retrying the same call unchanged could plausibly succeed. */
const RECOVERABLE: ReadonlySet<ConnectorErrorCode> = new Set([
  "upstream_unavailable",
  "timeout",
  "rate_limited",
]);

export interface FieldError {
  field: string;
  message: string;
}

export class ConnectorError extends Error {
  readonly code: ConnectorErrorCode;
  readonly recoverable: boolean;
  readonly fields?: FieldError[];
  readonly correlationId?: string;
  /** Operator-only. Never serialised toward a client. */
  readonly internal?: unknown;

  constructor(
    code: ConnectorErrorCode,
    message: string,
    opts: { fields?: FieldError[]; correlationId?: string; internal?: unknown } = {},
  ) {
    super(message);
    this.name = "ConnectorError";
    this.code = code;
    this.recoverable = RECOVERABLE.has(code);
    this.fields = opts.fields;
    this.correlationId = opts.correlationId;
    this.internal = opts.internal;
  }

  /** The only shape that may cross the wire. `internal` is dropped here, which
   *  is the entire point of it living on a separate property. */
  toPublic(): {
    code: ConnectorErrorCode;
    message: string;
    recoverable: boolean;
    fields?: FieldError[];
    correlation_id?: string;
  } {
    return {
      code: this.code,
      message: this.message,
      recoverable: this.recoverable,
      ...(this.fields ? { fields: this.fields } : {}),
      ...(this.correlationId ? { correlation_id: this.correlationId } : {}),
    };
  }
}

/**
 * Reduce anything thrown to a public error.
 *
 * Unknown throwables become a flat `internal` with a fixed message: a raw
 * `error.message` is exactly where a driver leaks a connection string or a
 * runtime leaks a file path. Convex, for instance, decorates a thrown Error as
 * `Uncaught Error: <msg>\n    at handler (../convex/x.ts:87:13)`.
 */
export function toConnectorError(e: unknown, correlationId?: string): ConnectorError {
  if (e instanceof ConnectorError) {
    return e.correlationId || !correlationId
      ? e
      : new ConnectorError(e.code, e.message, { fields: e.fields, correlationId, internal: e.internal });
  }
  return new ConnectorError("internal", "The operation failed. Nothing was changed.", {
    correlationId,
    internal: e,
  });
}

/** Non-cryptographic; it correlates a log line with a user report, nothing more. */
export const newCorrelationId = (): string =>
  `c_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
