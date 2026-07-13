const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeSessionCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function generateSessionCode(length = 4): string {
  const chars = CODE_CHARS;
  let result = "";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i += 1) {
    result += chars[values[i] % chars.length];
  }
  return result;
}

export function generateReconnectToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Client-generated id for a passage request, created and persisted BEFORE the
 * initiating POST so a refresh that races the response can still correlate
 * the host's echoed result without knowing the server event id.
 */
export function generatePassageRequestId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `pr-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Fail-closed request-id validation: shape and length, or null. */
export function normalizePassageRequestId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : null;
}

/** Per-session secret issued only to the creating host. */
export function generateHostToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Fail-closed host-token comparison. A session with no stored token (never
 * issued, e.g. created before host auth existed) rejects every request —
 * pre-migration lobbies must be recreated rather than remain unauthenticated.
 */
export function hostTokenMatches(stored: string | null | undefined, provided: unknown): boolean {
  if (typeof stored !== "string" || stored.length === 0) return false;
  return typeof provided === "string" && provided === stored;
}

const TURN_OWNED_ACTIONS = new Set([
  "reveal_clue",
  "use_secret_passage",
  "make_suggestion",
  "read_inspector_note",
  "continue_investigation",
  "resolve_accusation_penalty",
]);

/**
 * Whether a phone event may only be sent by the detective whose turn it is.
 * Table-wide actions (lobby setup, interruption acknowledgements, story
 * toggles) stay open to any authenticated player.
 */
export function isTurnOwnedPhoneAction(type: string, action: unknown): boolean {
  if (type === "accusation") return true;
  return type === "turn_action" && typeof action === "string" && TURN_OWNED_ACTIONS.has(action);
}

export function emptyEliminations() {
  return { suspects: [], items: [], locations: [], times: [] };
}

