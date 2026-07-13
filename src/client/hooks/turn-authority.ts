/**
 * Pure helpers for authorizing physical-game actions against the host's
 * local authoritative turn state, correlating acknowledgements to the exact
 * pending action they resolve, and de-duplicating phone events.
 *
 * The phone session (D1-backed) copy of the current turn is UI sync only;
 * authorization must always derive the actor from the host-local game state
 * passed into these helpers.
 */

export interface TurnActor {
  name: string;
  suspectId: string;
}

/** The pawn whose turn it is, from the host-local authoritative game state. */
export function resolveCurrentActor(state: {
  turnOrder: TurnActor[];
  players: TurnActor[];
  currentTurnIndex: number;
}): TurnActor | null {
  const order = state.turnOrder.length > 0 ? state.turnOrder : state.players;
  if (order.length === 0) return null;
  return order[state.currentTurnIndex % order.length];
}

/**
 * Monotonic phone-event cursor: an event is fresh only when its id is beyond
 * the last definitively processed id. Replays and reconnect re-deliveries
 * compare <= cursor and must be rejected.
 */
export function isEventFresh(cursor: number | null, eventId: number): boolean {
  return cursor === null || eventId > cursor;
}

/**
 * Correlates a phone acknowledgement to the exact pending action it was sent
 * for. `forEventId` is the phone-reported id of the event that created the
 * pending action; `sourceEventId` is the id persisted with the pending state
 * (null for host-local actions, which carry no phone event). A delayed or
 * replayed acknowledgement for an earlier action can therefore never resolve
 * a later pending action.
 */
export function matchesPendingSource(forEventId: unknown, sourceEventId: number | null): boolean {
  const normalized = typeof forEventId === "number" && Number.isFinite(forEventId) ? forEventId : null;
  return normalized === (sourceEventId ?? null);
}

const SUGGESTION_CATEGORY_IDS = ["suspect", "item", "location", "time"] as const;
export type SuggestionCategoryId = (typeof SUGGESTION_CATEGORY_IDS)[number];

/**
 * Validates a phone-supplied suggestion payload. Returns the categories only
 * when the raw value is an array of exactly three distinct allowed category
 * ids; anything else (wrong length, duplicates, unknown entries, non-arrays)
 * returns null and must be rejected — never silently replaced by defaults.
 */
export function parseSuggestionCategories(value: unknown): SuggestionCategoryId[] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const seen = new Set<SuggestionCategoryId>();
  for (const entry of value) {
    if (typeof entry !== "string") return null;
    if (!(SUGGESTION_CATEGORY_IDS as readonly string[]).includes(entry)) return null;
    seen.add(entry as SuggestionCategoryId);
  }
  if (seen.size !== 3) return null;
  return value as SuggestionCategoryId[];
}

export interface EventPipelineHooks<E extends { id: number }> {
  getCursor: () => number | null;
  commit: (eventId: number) => void;
  process: (event: E) => Promise<"handled" | "retry">;
  /** Called once per stall; should force a reconnect so the server replays
   * every uncommitted event in order from the persisted cursor. */
  requestRecovery: () => void;
}

/**
 * Strictly ordered, lossless event pipeline. Events run serially; when one
 * defers ("retry") or throws, the pipeline blocks: every later event is
 * dropped without committing, so a later id can never advance the cursor
 * past an unprocessed earlier id. Recovery reconnects and replays from the
 * persisted cursor; call unblock() when the new connection opens.
 */
export function createEventPipeline<E extends { id: number }>(hooks: EventPipelineHooks<E>) {
  let chain: Promise<void> = Promise.resolve();
  let blocked = false;

  const push = (event: E): Promise<void> => {
    chain = chain.then(async () => {
      if (blocked) return;
      if (!isEventFresh(hooks.getCursor(), event.id)) return;
      let outcome: "handled" | "retry";
      try {
        outcome = await hooks.process(event);
      } catch {
        outcome = "retry";
      }
      if (outcome === "retry") {
        blocked = true;
        hooks.requestRecovery();
        return;
      }
      hooks.commit(event.id);
    });
    return chain;
  };

  return {
    push,
    unblock: () => {
      blocked = false;
    },
    isBlocked: () => blocked,
  };
}

/**
 * Opaque token tying an acknowledgement to one specific pending action.
 * Embeds the turn and action sequence so a token can never collide with a
 * pending action created on another turn, plus a random suffix so two
 * pendings created at the same position (e.g. after an undo/restore) still
 * differ.
 */
export function createActionToken(kind: string, turnCount: number, sequence: number): string {
  return `${kind}-${turnCount}-${sequence}-${Math.random().toString(36).slice(2, 10)}`;
}
