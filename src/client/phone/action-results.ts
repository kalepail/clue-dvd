/**
 * Idempotent classification of host-reported turn-action results.
 *
 * The host's result snapshot can arrive BEFORE the phone's own action POST
 * resolves (which is when the phone learns its initiating event id). A result
 * must therefore never be marked seen until it has actually been correlated:
 * when the phone's own event id is still unknown — or the result references a
 * newer event than the last one the phone recorded — the result is deferred
 * and re-evaluated after the POST resolves.
 */

export interface TurnActionResult {
  action: string;
  ok: boolean;
  message: string;
  forEventId: number | null;
  requestId: string | null;
  updatedAt: string;
}

export type ActionResultDecision = "apply" | "ignore" | "defer";

/** The phone's own identifiers for its outstanding action. The request id is
 * client-generated and persisted BEFORE the initiating POST, so it survives a
 * refresh that races the response; the event id is only known after the POST
 * resolves. */
export interface OwnActionIdentity {
  eventId: number | null;
  requestId: string | null;
}

/**
 * Decides what to do with the latest host-reported result.
 *
 * - null: nothing to do (no result, or this exact result was already seen)
 * - "apply": the result correlates to the phone's own action — apply it and
 *   mark it seen
 * - "ignore": the result can never correlate — mark it seen without applying
 * - "defer": correlation is not yet decidable — do NOT mark seen;
 *   re-evaluate later
 *
 * Correlation prefers the client-generated request id (robust identity: it
 * exists before the POST resolves, so a refreshed phone with an unknown
 * event id still applies its result); the server event id is the fallback
 * for results without one.
 */
export function classifyActionResult(
  result: TurnActionResult | null | undefined,
  own: OwnActionIdentity,
  seenKey: string | null
): { decision: ActionResultDecision; key: string } | null {
  if (!result || !result.updatedAt) return null;
  const key = `${result.updatedAt}:${result.forEventId ?? ""}:${result.requestId ?? ""}`;
  if (seenKey === key) return null;
  const resultRequestId = result.requestId ?? null;
  if (resultRequestId !== null) {
    // With no own request id yet (e.g. persistence not hydrated after a
    // refresh), correlation is undecidable: defer without marking seen so a
    // later evaluation with the hydrated id can still apply this result.
    if (own.requestId === null) return { decision: "defer", key };
    return { decision: resultRequestId === own.requestId ? "apply" : "ignore", key };
  }
  if (result.forEventId === null) return { decision: "ignore", key };
  if (own.eventId === null || result.forEventId > own.eventId) return { decision: "defer", key };
  if (result.forEventId === own.eventId) return { decision: "apply", key };
  return { decision: "ignore", key };
}

/**
 * Per-player persisted record of this phone's own initiating action event
 * ids, plus whether a passage result is still outstanding. Restoring
 * passagePending after a refresh keeps the waiting UI up and blocks a second
 * submission until the correlated result arrives.
 */
export interface StoredActionEventIds {
  reveal: number | null;
  accusation: number | null;
  passage: number | null;
  passagePending: boolean;
  /** Client-generated request id of the outstanding passage, persisted
   * before the POST is sent. */
  passageRequestId: string | null;
  /** Session turn number (host turnCount) when the passage was submitted. */
  passageTurnNumber: number | null;
  /** Session turn number on which a passage last settled (used). */
  passageUsedTurnNumber: number | null;
}

function actionEventStorageKey(playerId: string): string {
  return `clue-dvd-phone-action-events:${playerId}`;
}

export function emptyStoredActionEventIds(): StoredActionEventIds {
  return {
    reveal: null,
    accusation: null,
    passage: null,
    passagePending: false,
    passageRequestId: null,
    passageTurnNumber: null,
    passageUsedTurnNumber: null,
  };
}

export function loadActionEventIds(playerId: string): StoredActionEventIds {
  const empty = emptyStoredActionEventIds();
  try {
    const raw = localStorage.getItem(actionEventStorageKey(playerId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Record<keyof StoredActionEventIds, unknown>>;
    return {
      reveal: typeof parsed.reveal === "number" ? parsed.reveal : null,
      accusation: typeof parsed.accusation === "number" ? parsed.accusation : null,
      passage: typeof parsed.passage === "number" ? parsed.passage : null,
      passagePending: parsed.passagePending === true,
      passageRequestId: typeof parsed.passageRequestId === "string" ? parsed.passageRequestId : null,
      passageTurnNumber: typeof parsed.passageTurnNumber === "number" ? parsed.passageTurnNumber : null,
      passageUsedTurnNumber: typeof parsed.passageUsedTurnNumber === "number" ? parsed.passageUsedTurnNumber : null,
    };
  } catch {
    return empty;
  }
}

export function persistActionEventIds(playerId: string, ids: StoredActionEventIds): void {
  try {
    localStorage.setItem(actionEventStorageKey(playerId), JSON.stringify(ids));
  } catch {
    // Best-effort; the host's recoverable modals remain the fallback.
  }
}

/** A passage may not be re-submitted while used this turn or still pending. */
export function shouldBlockPassageSubmit(usedThisTurn: boolean, passagePending: boolean): boolean {
  return usedThisTurn || passagePending;
}

/**
 * Decides which persisted turn-scoped passage state survives a refresh.
 * State is keyed to the session's durable turn number (the host's
 * authoritative turnCount), so it clears on any later turn — even when the
 * same suspect acts again in a later round — and never resurrects without a
 * known current turn number.
 */
export function restorePassageState(
  stored: StoredActionEventIds,
  currentTurnNumber: number | null
): { pending: boolean; usedThisTurn: boolean } {
  if (currentTurnNumber === null) return { pending: false, usedThisTurn: false };
  const pending = stored.passagePending && stored.passageTurnNumber === currentTurnNumber;
  const usedThisTurn = pending || stored.passageUsedTurnNumber === currentTurnNumber;
  return { pending, usedThisTurn };
}
