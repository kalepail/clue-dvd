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
  updatedAt: string;
}

export type ActionResultDecision = "apply" | "ignore" | "defer";

/**
 * Decides what to do with the latest host-reported result.
 *
 * - null: nothing to do (no result, or this exact result was already seen)
 * - "apply": the result correlates to the phone's own event — apply it and
 *   mark it seen
 * - "ignore": the result can never correlate (no source event, or an older
 *   event than the phone's own) — mark it seen without applying
 * - "defer": correlation is not yet decidable (own event id unknown, or the
 *   result references a newer event than the phone has recorded, i.e. the
 *   initiating POST has not resolved) — do NOT mark seen; re-evaluate later
 */
export function classifyActionResult(
  result: TurnActionResult | null | undefined,
  ownEventId: number | null,
  seenKey: string | null
): { decision: ActionResultDecision; key: string } | null {
  if (!result || !result.updatedAt) return null;
  const key = `${result.updatedAt}:${result.forEventId ?? ""}`;
  if (seenKey === key) return null;
  if (result.forEventId === null) return { decision: "ignore", key };
  if (ownEventId === null || result.forEventId > ownEventId) return { decision: "defer", key };
  if (result.forEventId === ownEventId) return { decision: "apply", key };
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
}

function actionEventStorageKey(playerId: string): string {
  return `clue-dvd-phone-action-events:${playerId}`;
}

export function loadActionEventIds(playerId: string): StoredActionEventIds {
  const empty: StoredActionEventIds = { reveal: null, accusation: null, passage: null, passagePending: false };
  try {
    const raw = localStorage.getItem(actionEventStorageKey(playerId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<Record<keyof StoredActionEventIds, unknown>>;
    return {
      reveal: typeof parsed.reveal === "number" ? parsed.reveal : null,
      accusation: typeof parsed.accusation === "number" ? parsed.accusation : null,
      passage: typeof parsed.passage === "number" ? parsed.passage : null,
      passagePending: parsed.passagePending === true,
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
