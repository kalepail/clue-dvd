import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateScenarioWithPlan } from "../../services/scenario-generator";
import { ITEMS, LOCATIONS, SUSPECTS, TIMES } from "../../shared/game-elements";
import type { GameStore as GameStoreType } from "./useGameStore";

const storage = new Map<string, string>();

beforeEach(() => {
  storage.clear();
  vi.resetModules();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
  });
});

function otherId(ids: string[], answerId: string): string {
  return ids.find((id) => id !== answerId)!;
}

function buildStoredGame(overrides: Record<string, unknown> = {}) {
  const { scenario } = generateScenarioWithPlan({ themeId: "DEV01", seed: 404 });
  const players = [
    { name: "Ada", suspectId: "S01" },
    { name: "Bert", suspectId: "S02" },
    { name: "Cy", suspectId: "S03" },
  ];
  return {
    scenario,
    game: {
      id: "ritual",
      status: "in_progress",
      theme: null,
      difficulty: "expert",
      playerCount: 3,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
      scenario,
      currentClueIndex: 0,
      phase: "investigation",
      wrongAccusations: 0,
      currentPlayer: null,
      startedAt: new Date(0).toISOString(),
      revealedClueIds: [],
      pendingPantryDrawClueNumber: null,
      pendingPantryDrawToken: null,
      pendingPantryDrawSourceEventId: null,
      players,
      phoneSessionCode: null,
      turnOrder: players,
      currentTurnIndex: 0,
      turnCount: 0,
      eliminatedSuspectIds: [],
      pendingAccusationPenalty: null,
      turnActionTakenAt: null,
      secretPassageUses: 0,
      secretPassageTurnUsedAt: null,
      lastPhonePassageResult: null,
      interruptionCount: 0,
      nextInterruptionAtMinutes: null,
      roomsUnlocked: false,
      readInspectorNotes: {},
      inspectorNoteAnnouncements: { note1: false, note2: false },
      inspectorNoteTurnUsedAt: {},
      solvedBy: null,
      actions: [],
      ...overrides,
    },
  };
}

async function loadStore(): Promise<GameStoreType> {
  const { GameStore } = await import("./useGameStore");
  return new GameStore();
}

function wrongAccusationFor(
  solution: { suspectId: string; itemId: string; locationId: string; timeId: string },
  player: { name: string; suspectId: string }
) {
  return {
    player: player.name,
    playerSuspectId: player.suspectId,
    suspectId: otherId(SUSPECTS.map((entry) => entry.id), solution.suspectId),
    itemId: otherId(ITEMS.map((entry) => entry.id), solution.itemId),
    locationId: otherId(LOCATIONS.map((entry) => entry.id), solution.locationId),
    timeId: otherId(TIMES.map((entry) => entry.id), solution.timeId),
  };
}

describe("physical turn rituals", () => {
  it("keeps a Butler summon pending until the physical Pantry draw is acknowledged", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    store.revealNextClue("ritual");
    expect(store.getGame("ritual")?.turnCount).toBe(0);
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBe(1);
    const token = store.getGame("ritual")!.pendingPantryDrawToken!;
    expect(token).toBeTruthy();

    // Everything else is blocked while the draw is pending
    expect(() => store.revealNextClue("ritual")).toThrow(/Pantry draw/i);
    expect(() => store.endTurn("ritual")).toThrow(/physical action/i);
    expect(() => store.useSecretPassage("ritual")).toThrow(/physical action/i);
    expect(() => store.recordSuggestion("ritual", ["suspect", "location", "time"])).toThrow(/physical action/i);
    expect(() => store.triggerInspectorInterruption("ritual")).toThrow(/physical action/i);
    expect(() =>
      store.makeAccusation("ritual", wrongAccusationFor(game.scenario.solution, { name: "Ada", suspectId: "S01" }))
    ).toThrow(/Pantry draw/i);

    // An acknowledgement must correlate to this exact pending draw
    expect(() => store.acknowledgePantryDraw("ritual", "forged-token")).toThrow(/does not match/i);
    expect(store.getGame("ritual")?.turnCount).toBe(0);

    store.acknowledgePantryDraw("ritual", token);
    expect(store.getGame("ritual")?.turnCount).toBe(1);
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBeNull();
    expect(store.getGame("ritual")?.pendingPantryDrawToken).toBeNull();
    expect(store.getGame("ritual")?.actions.find((action) => action.actionType === "pantry_draw_acknowledged")?.details)
      .toMatchObject({ clueNumber: 1, identityTracked: false });

    // Acknowledgement is idempotent: no second action, no double turn advance
    store.acknowledgePantryDraw("ritual", token);
    expect(store.getGame("ritual")?.turnCount).toBe(1);
    expect(
      store.getGame("ritual")?.actions.filter((action) => action.actionType === "pantry_draw_acknowledged")
    ).toHaveLength(1);
  });

  it("rejects a delayed acknowledgement of an earlier draw against a later pending draw", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    store.revealNextClue("ritual");
    const firstToken = store.getGame("ritual")!.pendingPantryDrawToken!;
    store.acknowledgePantryDraw("ritual", firstToken);

    store.revealNextClue("ritual");
    const secondToken = store.getGame("ritual")!.pendingPantryDrawToken!;
    expect(secondToken).not.toBe(firstToken);

    // The replayed first acknowledgement must not resolve the second draw
    expect(() => store.acknowledgePantryDraw("ritual", firstToken)).toThrow(/does not match/i);
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBe(2);

    store.acknowledgePantryDraw("ritual", secondToken);
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBeNull();
    expect(store.getGame("ritual")?.turnCount).toBe(2);
  });

  it("treats the secret passage as deterministic physical movement", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    const passage = store.useSecretPassage("ritual");
    expect(passage).toMatchObject({ outcome: "neutral" });
    expect(passage.description).toContain("movement, not your turn action");
    expect(() => store.useSecretPassage("ritual")).toThrow(/already used/i);

    // Movement does not consume the turn action: a suggestion still works
    store.recordSuggestion("ritual", ["suspect", "location", "time"]);
    expect(store.getGame("ritual")?.turnCount).toBe(1);
  });

  it("applies a phone-initiated passage once per source event, replaying the cached result", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    const first = store.useSecretPassageFromEvent("ritual", 77);
    expect(first.ok).toBe(true);
    expect(first.message).toContain("movement, not your turn action");
    expect(store.getGame("ritual")?.secretPassageUses).toBe(1);

    // Result delivery to the phone failed and the event replayed: the same
    // cached result comes back and the movement is not applied twice.
    const replay = store.useSecretPassageFromEvent("ritual", 77);
    expect(replay).toEqual(first);
    expect(store.getGame("ritual")?.secretPassageUses).toBe(1);
    expect(
      store.getGame("ritual")?.actions.filter((action) => action.actionType === "secret_passage")
    ).toHaveLength(1);

    // A rejection is cached and replayed the same way
    const rejected = store.useSecretPassageFromEvent("ritual", 78);
    expect(rejected.ok).toBe(false);
    expect(rejected.message).toMatch(/already used/i);
    expect(store.useSecretPassageFromEvent("ritual", 78)).toEqual(rejected);
    expect(store.getGame("ritual")?.secretPassageUses).toBe(1);
  });

  it("records suggestions as three categories only, never card identities", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    expect(() => store.recordSuggestion("ritual", ["suspect", "item"])).toThrow(/exactly three/i);
    expect(() => store.recordSuggestion("ritual", ["suspect", "item", "weapon"])).toThrow(/exactly three/i);
    expect(() => store.recordSuggestion("ritual", ["suspect", "suspect", "item"])).toThrow(/exactly three/i);
    // Four entries with three distinct values are still an invalid suggestion
    expect(() => store.recordSuggestion("ritual", ["suspect", "suspect", "item", "location"])).toThrow(/exactly three/i);

    store.recordSuggestion("ritual", ["suspect", "location", "time"], 0);
    const suggestion = store.getGame("ritual")?.actions.find((action) => action.actionType === "suggestion_made");
    expect(suggestion?.details).toMatchObject({
      categories: ["suspect", "location", "time"],
      omittedCategory: "item",
      cardIdentitiesTracked: false,
    });
    expect(Object.keys(suggestion?.details ?? {})).not.toContain("suspectId");
    expect(store.getGame("ritual")?.turnCount).toBe(1);

    // A stale double submit is rejected by the expected-turn guard
    expect(() => store.recordSuggestion("ritual", ["suspect", "location", "time"], 0)).toThrow(/already advanced/i);
    expect(
      store.getGame("ritual")?.actions.filter((action) => action.actionType === "suggestion_made")
    ).toHaveLength(1);
  });

  it("holds wrong accusations open until the item-card payment resolves", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();
    const solution = game.scenario.solution;

    const beforePayment = store.getGame("ritual")!.turnCount;
    const result = store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Ada", suspectId: "S01" }));
    expect(result.wrongCount).toBe(4);
    expect(result.penaltyToken).toBeTruthy();
    expect(store.getGame("ritual")?.turnCount).toBe(beforePayment);
    expect(store.getGame("ritual")?.pendingAccusationPenalty).toMatchObject({
      playerName: "Ada",
      playerSuspectId: "S01",
      wrongCount: 4,
      token: result.penaltyToken,
      turnCount: beforePayment,
    });

    // No further accusation or clue until the payment is settled
    expect(() =>
      store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Bert", suspectId: "S02" }))
    ).toThrow(/payment/i);
    expect(() => store.revealNextClue("ritual")).toThrow(/payment/i);

    // The payment confirmation must correlate to this exact penalty
    expect(() => store.resolveAccusationPenalty("ritual", "paid", "forged-token")).toThrow(/does not match/i);
    expect(store.getGame("ritual")?.pendingAccusationPenalty).not.toBeNull();

    store.resolveAccusationPenalty("ritual", "paid", result.penaltyToken!);
    expect(store.getGame("ritual")?.turnCount).toBe(beforePayment + 1);
    const payment = store.getGame("ritual")?.actions.find((action) => action.actionType === "card_shown");
    expect(payment?.details).toMatchObject({
      destination: "Evidence Room",
      itemCardCount: 4,
      identitiesTracked: false,
      reason: "wrong_accusation",
    });
    expect(Object.keys(payment?.details ?? {})).not.toContain("itemId");

    // Resolution is idempotent, even replayed with the settled token
    store.resolveAccusationPenalty("ritual", "paid", result.penaltyToken!);
    expect(store.getGame("ritual")?.turnCount).toBe(beforePayment + 1);
    expect(
      store.getGame("ritual")?.actions.filter((action) => action.actionType === "card_shown")
    ).toHaveLength(1);
  });

  it("rejects a replayed payment confirmation against a later penalty", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();
    const solution = game.scenario.solution;

    const first = store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Ada", suspectId: "S01" }));
    store.resolveAccusationPenalty("ritual", "paid", first.penaltyToken!);

    const second = store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Bert", suspectId: "S02" }));
    expect(second.penaltyToken).not.toBe(first.penaltyToken);

    // The first (already settled) token must not resolve Bert's penalty —
    // and especially must not eliminate him
    expect(() => store.resolveAccusationPenalty("ritual", "unable", first.penaltyToken!)).toThrow(/does not match/i);
    expect(store.getGame("ritual")?.pendingAccusationPenalty?.playerName).toBe("Bert");
    expect(store.getGame("ritual")?.eliminatedSuspectIds).toEqual([]);

    store.resolveAccusationPenalty("ritual", "paid", second.penaltyToken!);
    expect(store.getGame("ritual")?.pendingAccusationPenalty).toBeNull();
  });

  it("eliminates the pawn when the player cannot pay the item-card penalty", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();
    const solution = game.scenario.solution;

    const result = store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Ada", suspectId: "S01" }));
    store.resolveAccusationPenalty("ritual", "unable", result.penaltyToken!);

    const state = store.getGame("ritual")!;
    expect(state.eliminatedSuspectIds).toContain("S01");
    expect(state.turnOrder.map((player) => player.suspectId)).not.toContain("S01");
    expect(state.actions.some((action) => action.actionType === "player_eliminated")).toBe(true);
    expect(state.status).toBe("in_progress");

    // An eliminated detective can never accuse again
    expect(() =>
      store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Ada", suspectId: "S01" }))
    ).toThrow(/eliminated detective/i);
  });

  it("ends the case when every pawn is eliminated", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();
    const solution = game.scenario.solution;

    for (const player of [
      { name: "Ada", suspectId: "S01" },
      { name: "Bert", suspectId: "S02" },
      { name: "Cy", suspectId: "S03" },
    ]) {
      const result = store.makeAccusation("ritual", wrongAccusationFor(solution, player));
      store.resolveAccusationPenalty("ritual", "unable", result.penaltyToken!);
    }

    const state = store.getGame("ritual")!;
    expect(state.turnOrder).toHaveLength(0);
    expect(state.status).toBe("abandoned");
    expect(state.phase).toBe("resolution");
    expect(state.actions.some((action) => action.actionType === "game_abandoned")).toBe(true);
  });

  it("requires the accusing pawn to be identified", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    const accusation = wrongAccusationFor(game.scenario.solution, { name: "Ada", suspectId: "S01" });
    const { playerSuspectId: _omitted, ...withoutId } = accusation;
    expect(() =>
      store.makeAccusation("ritual", withoutId as unknown as typeof accusation)
    ).toThrow(/must identify/i);

    // Blank and whitespace-only pawn ids are equally rejected
    expect(() =>
      store.makeAccusation("ritual", { ...accusation, playerSuspectId: "" })
    ).toThrow(/must identify/i);
    expect(() =>
      store.makeAccusation("ritual", { ...accusation, playerSuspectId: "   " })
    ).toThrow(/must identify/i);
    expect(store.getGame("ritual")?.actions.some((action) => action.actionType === "accusation_made")).toBe(false);
  });

  it("only lets the current turn's detective make an accusation", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    // Turn 0 belongs to Ada (S01); Bert may not accuse out of turn
    expect(() =>
      store.makeAccusation("ritual", wrongAccusationFor(game.scenario.solution, { name: "Bert", suspectId: "S02" }))
    ).toThrow(/whose turn/i);
    expect(store.getGame("ritual")?.pendingAccusationPenalty).toBeNull();
  });

  it("commits a first-time inspector note read and the turn advance atomically", async () => {
    const { scenario, game } = buildStoredGame();
    const midGame = Math.ceil(scenario.clues.length * 0.5);
    storage.set("clue-dvd-games", JSON.stringify({ ritual: { ...game, currentClueIndex: midGame } }));
    const store = await loadStore();

    const read = store.readInspectorNote("ritual", "N1", "S01");
    expect(read.noteId).toBe("N1");
    expect(read.firstRead).toBe(true);

    // The read was the turn's action and the turn advanced in the same
    // committed state change — nothing can be stranded in between.
    expect(store.getGame("ritual")?.turnActionTakenAt).toBe(0);
    expect(store.getGame("ritual")?.turnCount).toBe(1);

    // Re-reading an already-read note stays free and never advances again
    const reread = store.readInspectorNote("ritual", "N1", "S01");
    expect(reread.text).toBe(read.text);
    expect(reread.firstRead).toBe(false);
    expect(store.getGame("ritual")?.turnCount).toBe(1);

    // The next player's turn proceeds normally
    store.recordSuggestion("ritual", ["suspect", "location", "time"]);
    expect(store.getGame("ritual")?.turnCount).toBe(2);
  });

  it("migrates games saved before the physical-workflow fields existed", async () => {
    const { game } = buildStoredGame();
    const legacy = { ...game } as Record<string, unknown>;
    delete legacy.pendingPantryDrawClueNumber;
    delete legacy.pendingPantryDrawToken;
    delete legacy.pendingPantryDrawSourceEventId;
    delete legacy.lastPhonePassageResult;
    delete legacy.eliminatedSuspectIds;
    delete legacy.pendingAccusationPenalty;
    delete legacy.turnActionTakenAt;
    storage.set("clue-dvd-games", JSON.stringify({ ritual: legacy }));
    const store = await loadStore();

    const migrated = store.getGame("ritual")!;
    expect(migrated.pendingPantryDrawClueNumber).toBeNull();
    expect(migrated.pendingPantryDrawToken).toBeNull();
    expect(migrated.pendingPantryDrawSourceEventId).toBeNull();
    expect(migrated.eliminatedSuspectIds).toEqual([]);
    expect(migrated.pendingAccusationPenalty).toBeNull();
    expect(migrated.turnActionTakenAt).toBeNull();
    expect(migrated.lastPhonePassageResult).toBeNull();

    // Acknowledging with nothing pending is a harmless no-op on legacy games
    store.acknowledgePantryDraw("ritual", "stale-token");
    expect(store.getGame("ritual")?.turnCount).toBe(0);
    expect(store.getGame("ritual")?.actions).toHaveLength(0);

    // The migrated game supports the full pending flow
    store.revealNextClue("ritual");
    const token = store.getGame("ritual")!.pendingPantryDrawToken!;
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBe(1);
    store.acknowledgePantryDraw("ritual", token);
    expect(store.getGame("ritual")?.turnCount).toBe(1);
  });

  it("generates correlation tokens for pendings saved by the pre-token version", async () => {
    const { game } = buildStoredGame();
    const legacy = { ...game } as Record<string, unknown>;
    legacy.pendingPantryDrawClueNumber = 1;
    delete legacy.pendingPantryDrawToken;
    legacy.pendingAccusationPenalty = { playerName: "Ada", playerSuspectId: "S01", wrongCount: 2 };
    storage.set("clue-dvd-games", JSON.stringify({ ritual: legacy }));
    const store = await loadStore();

    const migrated = store.getGame("ritual")!;
    expect(migrated.pendingPantryDrawToken).toBeTruthy();
    expect(migrated.pendingPantryDrawSourceEventId).toBeNull();
    expect(migrated.pendingAccusationPenalty?.token).toBeTruthy();
    expect(migrated.pendingAccusationPenalty?.turnCount).toBe(0);
    expect(migrated.pendingAccusationPenalty?.sourceEventId).toBeNull();

    // The generated tokens resolve their pendings normally
    store.acknowledgePantryDraw("ritual", migrated.pendingPantryDrawToken!);
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBeNull();
    store.resolveAccusationPenalty("ritual", "paid", migrated.pendingAccusationPenalty!.token);
    expect(store.getGame("ritual")?.pendingAccusationPenalty).toBeNull();
  });

  it("persists the initiating phone event id with each pending action", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();
    const solution = game.scenario.solution;

    // A phone-initiated summon carries its source event id; the host uses it
    // to require that acknowledgements reference this exact summon.
    store.revealNextClue("ritual", { sourceEventId: 41 });
    expect(store.getGame("ritual")?.pendingPantryDrawSourceEventId).toBe(41);
    store.acknowledgePantryDraw("ritual", store.getGame("ritual")!.pendingPantryDrawToken!);
    expect(store.getGame("ritual")?.pendingPantryDrawSourceEventId).toBeNull();

    // A host-local summon has no source event
    store.revealNextClue("ritual");
    expect(store.getGame("ritual")?.pendingPantryDrawSourceEventId).toBeNull();
    store.acknowledgePantryDraw("ritual", store.getGame("ritual")!.pendingPantryDrawToken!);

    // Same for accusations and their penalties (turn 2 belongs to Cy)
    store.makeAccusation(
      "ritual",
      wrongAccusationFor(solution, { name: "Cy", suspectId: "S03" }),
      { sourceEventId: 57 }
    );
    expect(store.getGame("ritual")?.pendingAccusationPenalty?.sourceEventId).toBe(57);
  });

  it("exposes pending physical state through getGameData for host and phone UI", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    store.revealNextClue("ritual");
    let data = store.getGameData("ritual")!;
    expect(data.pendingPantryDrawClueNumber).toBe(1);
    expect(data.pendingPantryDrawToken).toBe(store.getGame("ritual")!.pendingPantryDrawToken);
    expect(data.pendingAccusationPenalty).toBeNull();
    expect(data.eliminatedSuspectIds).toEqual([]);

    // Acknowledging advanced the turn to Bert (S02)
    store.acknowledgePantryDraw("ritual", data.pendingPantryDrawToken!);
    store.makeAccusation("ritual", wrongAccusationFor(game.scenario.solution, { name: "Bert", suspectId: "S02" }));
    data = store.getGameData("ritual")!;
    expect(data.pendingPantryDrawClueNumber).toBeNull();
    expect(data.pendingAccusationPenalty).toMatchObject({ playerName: "Bert", wrongCount: 4 });
    expect(data.pendingAccusationPenalty?.token).toBeTruthy();
  });
});
