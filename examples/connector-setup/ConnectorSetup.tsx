"use client";
/* Connector setup card — every value a host asks for, one click away.
 *
 * Drop this into any app's settings page. The ONLY thing you supply is the
 * `ConnectorConfig`; every string in every tab derives from it.
 *
 * Read it from the environment, so the same build serves staging and
 * production and nothing about a deployment is compiled in:
 *
 *   <ConnectorSetup config={connectorConfigFromEnv(process.env)} />
 *
 * ...or pass it literally when the values are already in hand:
 *
 *   <ConnectorSetup config={{
 *     name: "Your app",
 *     origin: "https://mcp.example.com",
 *     scopes: ["mcp.read", "mcp.write"],
 *     dcr: true,
 *   }} />
 *
 * WHY THIS EXISTS. Both host forms show a dozen inputs and neither says which
 * ones you must fill. Most of ChatGPT's are auto-discovered from your
 * `.well-known` documents and should be left alone; typing into them by hand
 * is how people break a connector that was about to work. So every row here
 * carries an explicit verdict — paste it, pick it, tick it, or leave it — and
 * the ones you actually touch are the short list at the top.
 *
 * Field labels are transcribed from the real modals (ChatGPT "New Plugin",
 * claude.ai "Add custom connector") so they match what the user is looking at
 * word for word. See ../../shared/setup-form.md.
 *
 * Dependency-free: no UI kit, no icon package, no CSS file. Inline <style>
 * scoped by one class, themed with CSS variables that inherit from the host
 * page and fall back to a dark/light pair of their own.
 */
import { useEffect, useId, useMemo, useRef, useState } from "react";

/* ────────────────────────────── config ────────────────────────────── */

export interface ConnectorConfig {
  /** Shown in the host's connector list. */
  name: string;
  /** Origin that serves /mcp AND the .well-known documents. No trailing slash. */
  origin: string;
  /** Scopes your server advertises in oauth-protected-resource. */
  scopes: string[];
  /** True when the server implements RFC 7591 dynamic client registration.
   *  When false, the user must create a client by hand and paste its id. */
  dcr: boolean;
  description?: string;
  /** Path the MCP endpoint answers on. ChatGPT requires it explicitly. */
  mcpPath?: string;
  /** Only read when `dcr` is false. */
  clientId?: string;
  clientSecret?: string;
  /** A bearer for the header-based clients (Claude Code, Cursor, curl).
   *  Pass null while none has been minted — those tabs then say so. */
  token?: string | null;
  /** True only if you serve an OIDC discovery document. Almost nobody does;
   *  MCP does not need it. */
  oidc?: boolean;
  /** Override any endpoint whose path differs from the conventional one. */
  endpoints?: Partial<Record<"authorize" | "token" | "register" | "asBase" | "resource", string>>;
}

/* Bundlers inline `process.env.X` only for literal member reads, so the caller
 * hands the record in. Prefixes are tried in order — whichever your framework
 * exposes to the browser wins. */
const PREFIXES = ["NEXT_PUBLIC_", "VITE_", "PUBLIC_", "REACT_APP_", ""] as const;

/**
 * Build the config from environment variables, so a deployment is configuration
 * and not a code change.
 *
 *   MCP_SERVER_NAME   required   shown in the host's connector list
 *   MCP_ORIGIN        required   origin serving /mcp and the .well-known docs
 *   MCP_SCOPES        required   space- or comma-separated
 *   MCP_DCR           required   "true" when the server implements RFC 7591
 *   MCP_PATH          optional   defaults to /mcp
 *   MCP_DESCRIPTION   optional
 *   MCP_CLIENT_ID     optional   only read when MCP_DCR is false
 *   MCP_OIDC          optional   "true" only if you serve an OIDC document
 *
 * Each name is accepted with a NEXT_PUBLIC_ / VITE_ / PUBLIC_ / REACT_APP_
 * prefix or none. Client secrets are deliberately NOT read here: anything this
 * component can see has already shipped to the browser.
 */
export function connectorConfigFromEnv(
  env: Record<string, string | undefined> = {},
): ConnectorConfig {
  const get = (key: string): string | undefined => {
    for (const p of PREFIXES) {
      const v = env[p + key];
      if (v !== undefined && v !== "") return v;
    }
    return undefined;
  };
  const flag = (key: string) => /^(1|true|yes|on)$/i.test(get(key) ?? "");

  const origin = get("MCP_ORIGIN");
  if (!origin) {
    // Fail loudly at render, not silently with a card full of "example.com" —
    // a connector card pointing at the wrong host is worse than none.
    throw new Error("connectorConfigFromEnv: MCP_ORIGIN is not set");
  }
  return {
    name: get("MCP_SERVER_NAME") ?? "MCP server",
    origin,
    scopes: (get("MCP_SCOPES") ?? "").split(/[\s,]+/).filter(Boolean),
    dcr: flag("MCP_DCR"),
    mcpPath: get("MCP_PATH"),
    description: get("MCP_DESCRIPTION"),
    clientId: get("MCP_CLIENT_ID"),
    oidc: flag("MCP_OIDC"),
  };
}

/** Everything the forms want, derived from four required fields. */
export function resolveConnector(c: ConnectorConfig) {
  const origin = c.origin.replace(/\/+$/, "");
  const server = origin + (c.mcpPath ?? "/mcp");
  const e = c.endpoints ?? {};
  return {
    ...c,
    origin,
    server,
    slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
    authorize: e.authorize ?? `${origin}/oauth/authorize`,
    token: e.token ?? `${origin}/oauth/token`,
    register: e.register ?? (c.dcr ? `${origin}/oauth/register` : ""),
    // RFC 9728: `authorization_servers[0]` from the protected-resource doc.
    asBase: e.asBase ?? origin,
    // RFC 8707 resource indicator — the MCP endpoint itself, not the origin.
    resource: e.resource ?? server,
    protectedResource: `${origin}/.well-known/oauth-protected-resource`,
    bearer: c.token ?? null,
  };
}
type Resolved = ReturnType<typeof resolveConnector>;

/* ─────────────────────────── row vocabulary ─────────────────────────── */

/** The verdict for one input. This is the whole point of the component: the
 *  user should never have to guess whether a field wants their attention. */
type Verdict =
  | "paste"  // copy the value here
  | "pick"   // choose this option from a control
  | "tick"   // check a box
  | "auto"   // discovery fills it — only paste if you find it EMPTY
  | "skip";  // leave it alone entirely

const VERDICT: Record<Verdict, { label: string; hint: string }> = {
  paste: { label: "paste", hint: "Copy this value into the field" },
  pick: { label: "pick", hint: "Choose this option" },
  tick: { label: "tick", hint: "Check this box" },
  auto: { label: "auto", hint: "Filled in for you — only paste if you find it empty" },
  skip: { label: "leave blank", hint: "Do not fill this in" },
};

interface Row {
  /** Verbatim label from the host's UI, so it matches what they are staring at. */
  field: string;
  verdict: Verdict;
  value?: string;
  note?: string;
}
interface Group {
  title: string;
  note?: string;
  rows: Row[];
}
interface Guide {
  id: string;
  host: string;
  /** Where the form lives. */
  path: string;
  lede: string;
  groups: Group[];
  /** Things that bite after the form is submitted. */
  traps?: string[];
}

/* ───────────────────────────── the guides ───────────────────────────── */

function chatgpt(c: Resolved): Guide {
  const manual: Row[] = c.dcr
    ? [
        {
          field: "Registration method",
          verdict: "pick",
          value: "Dynamic Client Registration (DCR)",
          note:
            "This server supports DCR, so no client id is needed. If the option reads “(Unavailable)”, ChatGPT could not discover the Registration URL — paste it below, close the modal, and reopen it.",
        },
      ]
    : [
        {
          field: "Registration method",
          verdict: "pick",
          value: "User-Defined OAuth Client",
          note: "DCR and CIMD will read “(Unavailable)” — this server does not offer them.",
        },
        { field: "Client ID", verdict: "paste", value: c.clientId ?? "", note: c.clientId ? undefined : "Create a client first — no id configured." },
        ...(c.clientSecret ? [{ field: "Client Secret", verdict: "paste" as const, value: c.clientSecret }] : []),
      ];

  return {
    id: "chatgpt",
    host: "ChatGPT",
    path: "Settings → Apps → Advanced settings → Developer mode, then Plugins → +",
    lede:
      "Paste the Server URL and ChatGPT discovers everything else from your .well-known documents. The advanced panel is a fallback for when that discovery fails — an empty field there is the only reason to touch it.",
    groups: [
      {
        title: "1 · The two fields you actually fill",
        rows: [
          { field: "Name", verdict: "paste", value: c.name },
          ...(c.description ? [{ field: "Description (optional)", verdict: "paste" as const, value: c.description }] : []),
          {
            field: "Connection",
            verdict: "pick",
            value: "Server URL",
            note: "Not “Tunnel” — that is for a server running on your own machine.",
          },
          {
            field: "Server URL",
            verdict: "paste",
            value: c.server,
            note: "The /mcp path is required and is not inferred from the origin.",
          },
          { field: "Authentication", verdict: "pick", value: "OAuth" },
        ],
      },
      {
        title: "2 · Advanced OAuth settings → Client registration",
        note: "Open the “Advanced OAuth settings” panel. Everything from here down is pre-filled unless discovery failed.",
        rows: manual,
      },
      {
        title: "3 · Scopes",
        rows: [
          {
            field: "Default scopes",
            verdict: "paste",
            value: c.scopes.join("\n"),
            note: "One per line. Requested when an action does not declare its own scope tags.",
          },
          {
            field: "Base scopes",
            verdict: "skip",
            note: "Requested on top of the default scopes on every auth request. This server has no scope that needs to be present unconditionally.",
          },
        ],
      },
      {
        title: "4 · OAuth endpoints",
        note: "Discovered from the server. Compare them against these — if one is blank, paste it; if one differs, your discovery document is wrong, and fixing it there beats patching it here.",
        rows: [
          { field: "Auth URL", verdict: "auto", value: c.authorize },
          { field: "Token URL", verdict: "auto", value: c.token },
          {
            field: "Registration URL",
            verdict: c.dcr ? "auto" : "skip",
            value: c.dcr ? c.register : undefined,
            note: c.dcr ? undefined : "No DCR on this server; a client id is used instead.",
          },
          { field: "Authorization server base", verdict: "auto", value: c.asBase },
          { field: "Resource", verdict: "auto", value: c.resource, note: "The MCP endpoint itself, not the origin." },
        ],
      },
      {
        title: "5 · OpenID support",
        note: c.oidc
          ? "This server advertises an OIDC configuration URL."
          : "All four controls stay untouched. “OIDC enabled” is greyed out because this server advertises no OIDC configuration URL — that is expected, and MCP does not need one. OIDC only lets ChatGPT read your email for domain claiming.",
        rows: c.oidc
          ? [
              { field: "OIDC enabled", verdict: "tick" },
              { field: "OIDC configuration URL", verdict: "auto", value: `${c.origin}/.well-known/openid-configuration` },
              { field: "OIDC userinfo endpoint", verdict: "auto" },
              { field: "OIDC scopes supported", verdict: "auto" },
            ]
          : [
              { field: "OIDC enabled", verdict: "skip" },
              { field: "OIDC configuration URL", verdict: "skip" },
              { field: "OIDC userinfo endpoint", verdict: "skip" },
              { field: "OIDC scopes supported", verdict: "skip" },
            ],
      },
      {
        title: "6 · Finish",
        rows: [
          { field: "Icon (optional)", verdict: "skip", note: "PNG only, 256×256 or larger, 10 KB max. Purely cosmetic." },
          { field: "I understand and want to continue", verdict: "tick", note: "Create stays disabled until this is checked." },
          { field: "Create", verdict: "pick", note: "Then run Scan Tools. The app lands in Drafts." },
        ],
      },
    ],
    traps: [
      "Developer mode is web only, and the setting has moved — if Settings → Apps has no Advanced settings, look under Settings → Security and login.",
      "Scan Tools failing with every tool missing usually means the descriptor is malformed, not that auth is wrong. A 401 at this stage is normal and expected.",
    ],
  };
}

function claudeAi(c: Resolved): Guide {
  return {
    id: "claude-ai",
    host: "claude.ai",
    path: "Settings → Connectors → Add custom connector",
    lede: "Two fields. The advanced pair stays empty unless this server has no dynamic registration.",
    groups: [
      {
        title: "1 · The form",
        rows: [
          { field: "Name", verdict: "paste", value: c.name, note: "Shown in the connectors list." },
          {
            field: "Remote MCP server URL",
            verdict: "paste",
            value: c.server,
            note: "Must be HTTPS and must include the path the server answers on.",
          },
        ],
      },
      {
        title: "2 · Advanced settings",
        rows: c.dcr
          ? [
              { field: "OAuth Client ID (optional)", verdict: "skip", note: "This server registers clients dynamically — leave it empty and Claude handles it." },
              { field: "OAuth Client Secret (optional)", verdict: "skip" },
            ]
          : [
              { field: "OAuth Client ID (optional)", verdict: "paste", value: c.clientId ?? "" },
              { field: "OAuth Client Secret (optional)", verdict: c.clientSecret ? "paste" : "skip", value: c.clientSecret },
            ],
      },
      { title: "3 · Finish", rows: [{ field: "Add", verdict: "pick", note: "Then approve the OAuth prompt." }] },
    ],
    traps: [
      "A connector cannot be edited after it is added — you have to remove it and add it again, so a typo in the URL costs a full re-entry.",
      "Claude dials out from Anthropic's cloud, not from your machine. localhost and any private address will never connect, on web, desktop or mobile.",
    ],
  };
}

function claudeCode(c: Resolved): Guide {
  const tok = c.bearer ?? "MCP_TOKEN";
  return {
    id: "claude-code",
    host: "Claude Code",
    path: "your terminal, or .mcp.json at the repo root",
    lede: "The only host here with a real credential field, so this one takes a bearer directly.",
    groups: [
      {
        title: "Option A · one command",
        rows: [
          {
            field: "terminal",
            verdict: "paste",
            value: `claude mcp add --transport http ${c.slug} ${c.server} \\\n  --header "Authorization: Bearer ${tok}"`,
            note: "Adding does not validate anything. Run /mcp afterwards; a bad token shows as failed.",
          },
        ],
      },
      {
        title: "Option B · committed to the repo",
        note: "Keeps the token out of git — ${MCP_TOKEN} is expanded from the environment at load time.",
        rows: [
          {
            field: ".mcp.json",
            verdict: "paste",
            value: JSON.stringify(
              { mcpServers: { [c.slug]: { type: "http", url: c.server, headers: { Authorization: "Bearer ${MCP_TOKEN}" } } } },
              null,
              2,
            ),
            note: '"type" is mandatory. A url without it is a config error and the server is skipped silently.',
          },
        ],
      },
    ],
    traps: [
      "An unset ${MCP_TOKEN} does not fail the load — Claude Code sends the literal text and your server answers 401.",
      "Do not name the server workspace, computer-use or claude-in-chrome; those are reserved and skipped without a message.",
    ],
  };
}

function cursor(c: Resolved): Guide {
  return {
    id: "cursor",
    host: "Cursor",
    path: ".cursor/mcp.json in the project, or ~/.cursor/mcp.json globally",
    lede: "Looks identical to Claude Code's file and is not interchangeable with it.",
    groups: [
      {
        title: "The file",
        rows: [
          {
            field: ".cursor/mcp.json",
            verdict: "paste",
            value: JSON.stringify(
              { mcpServers: { [c.slug]: { url: c.server, headers: { Authorization: "Bearer ${env:MCP_TOKEN}" } } } },
              null,
              2,
            ),
          },
        ],
      },
    ],
    traps: [
      "No \"type\" key here — Cursor's remote shape omits it, while Claude Code errors without it.",
      "The interpolation syntax is ${env:NAME}. Paste Claude Code's ${MCP_TOKEN} into this file and Cursor sends it as literal text.",
    ],
  };
}

function smoke(c: Resolved): Guide {
  const tok = c.bearer ?? "MCP_TOKEN";
  return {
    id: "verify",
    host: "Verify",
    path: "any terminal",
    lede: "Run this before blaming a host. It proves DNS, TLS, routing and the auth gate in one call.",
    groups: [
      {
        title: "Is the endpoint alive?",
        rows: [
          {
            field: "curl",
            verdict: "paste",
            value: `curl -sS -i -X POST ${c.server} \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'`,
            note: "A 401 with a WWW-Authenticate header is a PASS: the server is up and the auth gate works. You are ruling out 404 and a timeout.",
          },
        ],
      },
      {
        title: "Does discovery work?",
        note: "If ChatGPT's advanced fields come up blank, this is the document that failed.",
        rows: [{ field: "curl", verdict: "paste", value: `curl -sS ${c.protectedResource}` }],
      },
      ...(c.bearer
        ? [
            {
              title: "With your token",
              rows: [
                {
                  field: "curl",
                  verdict: "paste" as const,
                  value: `curl -sS -X POST ${c.server} \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${tok}" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
                },
              ],
            },
          ]
        : []),
    ],
  };
}

export function buildGuides(c: Resolved): Guide[] {
  return [chatgpt(c), claudeAi(c), claudeCode(c), cursor(c), smoke(c)];
}

const rowsOf = (g: Guide) => g.groups.flatMap((x) => x.rows);
const total = (g: Guide) => rowsOf(g).length;
/** Rows that genuinely want a human action, as opposed to the majority that
 *  discovery already handled or that must be left empty. */
const yours = (g: Guide) => rowsOf(g).filter((r) => r.verdict !== "auto" && r.verdict !== "skip").length;

/* ───────────────────────────── copy field ───────────────────────────── */

/** A value that IS copyable, so the affordance cannot drift from the thing it
 *  copies. Trims on write: a trailing newline is the documented cause of
 *  "Leading or trailing whitespace in: headers.Authorization", which hosts
 *  either warn about without fixing, or silently fail on. */
export function CopyField({ value, what }: { value: string; what: string }) {
  const [state, setState] = useState<"idle" | "ok" | "manual">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const ref = useRef<HTMLPreElement>(null);
  const clean = value.trim();

  useEffect(
    () => () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    let next: "ok" | "manual" = "ok";
    try {
      // Absent on insecure origins; throws when denied — one catch covers both.
      if (!navigator.clipboard?.writeText) throw new Error("no clipboard");
      await navigator.clipboard.writeText(clean);
    } catch {
      // Select it so it stays one Ctrl+C away. A dead button is worse.
      next = "manual";
      const node = ref.current;
      if (node && window.getSelection) {
        const r = document.createRange();
        r.selectNodeContents(node);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(r);
      }
    }
    if (!alive.current) return;
    setState(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  }

  return (
    <div className="cs-copy">
      <pre ref={ref} className="cs-val">{clean}</pre>
      <button type="button" className="cs-btn" onClick={() => void copy()} title={`Copy ${what}`} aria-label={`Copy ${what}`}>
        {state === "ok" ? "copied" : state === "manual" ? "select + ⌘C" : "copy"}
      </button>
      <span role="status" aria-live="polite" className="cs-sr">
        {state === "ok" ? `${what} copied` : state === "manual" ? `${what} selected, press control C` : ""}
      </span>
    </div>
  );
}

/* ────────────────────────────── component ────────────────────────────── */

export default function ConnectorSetup({ config }: { config: ConnectorConfig }) {
  const c = useMemo(() => resolveConnector(config), [config]);
  const guides = useMemo(() => buildGuides(c), [c]);
  const [active, setActive] = useState(guides[0]!.id);
  const guide = guides.find((g) => g.id === active) ?? guides[0]!;
  const uid = useId().replace(/[:]/g, "");

  return (
    <section className={`cs cs-${uid}`} aria-label={`Connect ${c.name}`}>
      <style>{CSS}</style>

      <header className="cs-head">
        <div>
          <h2 className="cs-title">Connect {c.name}</h2>
          <p className="cs-sub">
            One server, {guides.length} ways in. The endpoint never changes — only the string each client wants.
          </p>
        </div>
        <div className="cs-endpoint">
          <span className="cs-endpoint-label">MCP endpoint</span>
          <CopyField value={c.server} what="MCP endpoint" />
        </div>
      </header>

      <div className="cs-legend">
        <span><b className="cs-k-paste">paste</b> copy it in</span>
        <span><b className="cs-k-attn">pick / tick</b> choose or check</span>
        <span><b className="cs-k-ok">auto</b> already filled; paste only if blank</span>
        <span><b className="cs-k-skip">leave blank</b> do not touch</span>
      </div>

      <div className="cs-tabs" role="tablist" aria-label="Client">
        {guides.map((g) => (
          <button
            key={g.id}
            role="tab"
            type="button"
            aria-selected={g.id === active}
            className={`cs-tab${g.id === active ? " is-on" : ""}`}
            onClick={() => setActive(g.id)}
          >
            {g.host}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="cs-panel">
        <p className="cs-where">
          <span className="cs-where-k">Where</span> {guide.path}
        </p>
        <p className="cs-lede">{guide.lede}</p>
        <p className="cs-count">
          {/* Summary before detail: the honest headline of this whole card is
              that most of what the form shows is not the user's problem. */}
          <strong>{yours(guide)}</strong> of {total(guide)} fields need you
          {total(guide) - yours(guide) > 0 && <> — the other {total(guide) - yours(guide)} are discovered or left alone</>}.
        </p>

        {guide.groups.map((grp) => (
          <div key={grp.title} className="cs-group">
            <h3 className="cs-group-title">{grp.title}</h3>
            {grp.note && <p className="cs-group-note">{grp.note}</p>}
            {grp.rows.map((row, i) => (
              <div key={`${row.field}-${i}`} className={`cs-row cs-v-${row.verdict}`}>
                <div className="cs-row-head">
                  <code className="cs-field">{row.field}</code>
                  <span className="cs-badge" title={VERDICT[row.verdict].hint}>
                    {VERDICT[row.verdict].label}
                  </span>
                </div>
                {row.value !== undefined && row.value !== "" && (
                  <CopyField value={row.value} what={`${guide.host} ${row.field}`} />
                )}
                {row.value === "" && <p className="cs-missing">Not configured — set it in this component's config.</p>}
                {row.note && <p className="cs-note">{row.note}</p>}
              </div>
            ))}
          </div>
        ))}

        {guide.traps && guide.traps.length > 0 && (
          <div className="cs-traps">
            <h3 className="cs-group-title">Before you hit save</h3>
            <ul>
              {guide.traps.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

/* One scoped stylesheet. Variables inherit from the host page when it defines
 * them, so this adopts an existing design system without being coupled to one. */
const CSS = `
/* Neutrals carry a slight cool bias toward the accent so they read as chosen
 * rather than inherited. One accent only, spent on the primary action —
 * "paste". Amber and green are semantics for the verdict scale and are never
 * used decoratively. */
.cs {
  --cs-fg: var(--foreground, #14161b);
  --cs-muted: var(--muted-foreground, #6a7080);
  --cs-bg: var(--card, #ffffff);
  --cs-sunk: var(--muted, #f3f4f7);
  --cs-line: var(--border, #e4e7ec);
  --cs-accent: var(--primary, #2b56d4);
  --cs-warn: #a35c00;
  --cs-ok: #16794a;
  color: var(--cs-fg);
  font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  container-type: inline-size;
}
@media (prefers-color-scheme: dark) {
  .cs {
    --cs-fg: var(--foreground, #e8eaf0);
    --cs-muted: var(--muted-foreground, #939aa8);
    --cs-bg: var(--card, #171a20);
    --cs-sunk: var(--muted, #1f232b);
    --cs-line: var(--border, #2a2f38);
    --cs-accent: var(--primary, #7f9cff);
    --cs-warn: #e0a340;
    --cs-ok: #4cc38a;
  }
}
.cs * { box-sizing: border-box; }
.cs-head { display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: flex-start; margin-bottom: 1.25rem; }
.cs-title { font-size: 1.1rem; font-weight: 650; margin: 0; }
.cs-sub { margin: .25rem 0 0; color: var(--cs-muted); max-width: 46ch; }
.cs-endpoint { min-width: min(100%, 22rem); flex: 1; }
.cs-endpoint-label { display: block; font-size: .7rem; letter-spacing: .06em; text-transform: uppercase; color: var(--cs-muted); margin-bottom: .3rem; }
.cs-tabs { display: flex; flex-wrap: wrap; gap: .25rem; border-bottom: 1px solid var(--cs-line); margin-bottom: 1rem; }
.cs-tab { appearance: none; background: none; border: 0; border-bottom: 2px solid transparent; padding: .5rem .75rem; margin-bottom: -1px; font: inherit; color: var(--cs-muted); cursor: pointer; border-radius: 6px 6px 0 0; }
.cs-tab:hover { color: var(--cs-fg); }
.cs-tab.is-on { color: var(--cs-fg); border-bottom-color: var(--cs-accent); font-weight: 600; }
.cs-tab:focus-visible { outline: 2px solid var(--cs-accent); outline-offset: 2px; }
.cs-where { margin: 0 0 .5rem; font-size: .82rem; color: var(--cs-muted); }
.cs-where-k { display: inline-block; font-size: .68rem; letter-spacing: .06em; text-transform: uppercase; color: var(--cs-muted); border: 1px solid var(--cs-line); border-radius: 4px; padding: 0 .35rem; margin-right: .45rem; }
.cs-lede { margin: 0 0 1.25rem; max-width: 68ch; }
.cs-group { margin-bottom: 1.5rem; }
.cs-group-title { font-size: .8rem; letter-spacing: .04em; text-transform: uppercase; color: var(--cs-muted); margin: 0 0 .5rem; font-weight: 600; }
.cs-group-note { margin: 0 0 .75rem; color: var(--cs-muted); max-width: 68ch; font-size: .88rem; }
.cs-row { border: 1px solid var(--cs-line); border-left-width: 3px; border-radius: 8px; padding: .6rem .7rem; margin-bottom: .5rem; background: var(--cs-bg); }
.cs-row-head { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.cs-field { font: 600 .85rem/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; }
.cs-badge { font-size: .66rem; letter-spacing: .05em; text-transform: uppercase; padding: .1rem .4rem; border-radius: 999px; border: 1px solid currentColor; opacity: .9; cursor: help; }
.cs-v-paste { border-left-color: var(--cs-accent); }
.cs-v-paste .cs-badge { color: var(--cs-accent); }
.cs-v-pick, .cs-v-tick { border-left-color: var(--cs-warn); }
.cs-v-pick .cs-badge, .cs-v-tick .cs-badge { color: var(--cs-warn); }
.cs-v-auto { border-left-color: var(--cs-ok); }
.cs-v-auto .cs-badge { color: var(--cs-ok); }
.cs-v-skip { border-left-color: var(--cs-line); opacity: .72; }
.cs-v-skip .cs-badge { color: var(--cs-muted); }
.cs-note { margin: .45rem 0 0; font-size: .82rem; color: var(--cs-muted); max-width: 72ch; }
.cs-missing { margin: .45rem 0 0; font-size: .82rem; color: var(--cs-warn); }
.cs-copy { display: flex; align-items: stretch; gap: .4rem; margin-top: .45rem; }
.cs-val { flex: 1; min-width: 0; margin: 0; padding: .45rem .55rem; background: var(--cs-sunk); border-radius: 6px; font: .78rem/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; }
.cs-btn { flex-shrink: 0; align-self: flex-start; appearance: none; border: 1px solid var(--cs-line); background: var(--cs-bg); color: var(--cs-fg); border-radius: 6px; padding: .4rem .6rem; font: 500 .75rem/1 inherit; cursor: pointer; white-space: nowrap; }
.cs-btn:hover { border-color: var(--cs-accent); color: var(--cs-accent); }
.cs-btn:focus-visible { outline: 2px solid var(--cs-accent); outline-offset: 2px; }
.cs-traps { border: 1px solid var(--cs-line); border-radius: 8px; padding: .8rem .9rem; background: var(--cs-sunk); }
.cs-traps ul { margin: 0; padding-left: 1.1rem; }
.cs-traps li { margin-bottom: .4rem; max-width: 74ch; }
.cs-traps li:last-child { margin-bottom: 0; }
.cs-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.cs-legend { display: flex; flex-wrap: wrap; gap: .35rem 1.1rem; margin: 0 0 1rem; padding: .55rem .75rem; border: 1px solid var(--cs-line); border-radius: 8px; font-size: .78rem; color: var(--cs-muted); }
.cs-legend b { font: 600 .66rem/1.6 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing: .05em; text-transform: uppercase; margin-right: .35rem; }
.cs-k-paste { color: var(--cs-accent); }
.cs-k-attn { color: var(--cs-warn); }
.cs-k-ok { color: var(--cs-ok); }
.cs-k-skip { color: var(--cs-muted); }
.cs-count { margin: -.5rem 0 1.25rem; font-size: .84rem; color: var(--cs-muted); }
.cs-count strong { color: var(--cs-accent); font-variant-numeric: tabular-nums; }
@container (max-width: 34rem) { .cs-copy { flex-direction: column; } .cs-btn { align-self: stretch; } }
@media (prefers-reduced-motion: reduce) { .cs * { transition: none !important; animation: none !important; } }
`;
