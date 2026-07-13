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

    // Everything else is blocked while the draw is pending
    expect(() => store.revealNextClue("ritual")).toThrow(/Pantry draw/i);
    expect(() => store.endTurn("ritual")).toThrow(/physical action/i);
    expect(() => store.useSecretPassage("ritual")).toThrow(/physical action/i);
    expect(() => store.recordSuggestion("ritual", ["suspect", "location", "time"])).toThrow(/physical action/i);
    expect(() => store.triggerInspectorInterruption("ritual")).toThrow(/physical action/i);
    expect(() =>
      store.makeAccusation("ritual", wrongAccusationFor(game.scenario.solution, { name: "Ada", suspectId: "S01" }))
    ).toThrow(/Pantry draw/i);

    store.acknowledgePantryDraw("ritual");
    expect(store.getGame("ritual")?.turnCount).toBe(1);
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBeNull();
    expect(store.getGame("ritual")?.actions.find((action) => action.actionType === "pantry_draw_acknowledged")?.details)
      .toMatchObject({ clueNumber: 1, identityTracked: false });

    // Acknowledgement is idempotent: no second action, no double turn advance
    store.acknowledgePantryDraw("ritual");
    expect(store.getGame("ritual")?.turnCount).toBe(1);
    expect(
      store.getGame("ritual")?.actions.filter((action) => action.actionType === "pantry_draw_acknowledged")
    ).toHaveLength(1);
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

  it("records suggestions as three categories only, never card identities", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    expect(() => store.recordSuggestion("ritual", ["suspect", "item"])).toThrow(/exactly three/i);
    expect(() => store.recordSuggestion("ritual", ["suspect", "item", "weapon"])).toThrow(/exactly three/i);
    expect(() => store.recordSuggestion("ritual", ["suspect", "suspect", "item"])).toThrow(/exactly three/i);

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
    const result = store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Bert", suspectId: "S02" }));
    expect(result.wrongCount).toBe(4);
    expect(store.getGame("ritual")?.turnCount).toBe(beforePayment);
    expect(store.getGame("ritual")?.pendingAccusationPenalty).toMatchObject({
      playerName: "Bert",
      playerSuspectId: "S02",
      wrongCount: 4,
    });

    // No further accusation or clue until the payment is settled
    expect(() =>
      store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Ada", suspectId: "S01" }))
    ).toThrow(/payment/i);
    expect(() => store.revealNextClue("ritual")).toThrow(/payment/i);

    store.resolveAccusationPenalty("ritual", "paid");
    expect(store.getGame("ritual")?.turnCount).toBe(beforePayment + 1);
    const payment = store.getGame("ritual")?.actions.find((action) => action.actionType === "card_shown");
    expect(payment?.details).toMatchObject({
      destination: "Evidence Room",
      itemCardCount: 4,
      identitiesTracked: false,
      reason: "wrong_accusation",
    });
    expect(Object.keys(payment?.details ?? {})).not.toContain("itemId");

    // Resolution is idempotent
    store.resolveAccusationPenalty("ritual", "paid");
    expect(store.getGame("ritual")?.turnCount).toBe(beforePayment + 1);
    expect(
      store.getGame("ritual")?.actions.filter((action) => action.actionType === "card_shown")
    ).toHaveLength(1);
  });

  it("eliminates the pawn when the player cannot pay the item-card penalty", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();
    const solution = game.scenario.solution;

    store.makeAccusation("ritual", wrongAccusationFor(solution, { name: "Cy", suspectId: "S03" }));
    store.resolveAccusationPenalty("ritual", "unable");

    const state = store.getGame("ritual")!;
    expect(state.eliminatedSuspectIds).toContain("S03");
    expect(state.turnOrder.map((player) => player.suspectId)).not.toContain("S03");
    expect(state.actions.some((action) => action.actionType === "player_eliminated")).toBe(true);
    expect(state.status).toBe("in_progress");
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
      store.makeAccusation("ritual", wrongAccusationFor(solution, player));
      store.resolveAccusationPenalty("ritual", "unable");
    }

    const state = store.getGame("ritual")!;
    expect(state.turnOrder).toHaveLength(0);
    expect(state.status).toBe("abandoned");
    expect(state.phase).toBe("resolution");
    expect(state.actions.some((action) => action.actionType === "game_abandoned")).toBe(true);
  });

  it("migrates games saved before the physical-workflow fields existed", async () => {
    const { game } = buildStoredGame();
    const legacy = { ...game } as Record<string, unknown>;
    delete legacy.pendingPantryDrawClueNumber;
    delete legacy.eliminatedSuspectIds;
    delete legacy.pendingAccusationPenalty;
    delete legacy.turnActionTakenAt;
    storage.set("clue-dvd-games", JSON.stringify({ ritual: legacy }));
    const store = await loadStore();

    const migrated = store.getGame("ritual")!;
    expect(migrated.pendingPantryDrawClueNumber).toBeNull();
    expect(migrated.eliminatedSuspectIds).toEqual([]);
    expect(migrated.pendingAccusationPenalty).toBeNull();
    expect(migrated.turnActionTakenAt).toBeNull();

    // Acknowledging with nothing pending is a harmless no-op on legacy games
    store.acknowledgePantryDraw("ritual");
    expect(store.getGame("ritual")?.turnCount).toBe(0);
    expect(store.getGame("ritual")?.actions).toHaveLength(0);

    // The migrated game supports the full pending flow
    store.revealNextClue("ritual");
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBe(1);
    store.acknowledgePantryDraw("ritual");
    expect(store.getGame("ritual")?.turnCount).toBe(1);
  });

  it("exposes pending physical state through getGameData for host and phone UI", async () => {
    const { game } = buildStoredGame();
    storage.set("clue-dvd-games", JSON.stringify({ ritual: game }));
    const store = await loadStore();

    store.revealNextClue("ritual");
    let data = store.getGameData("ritual")!;
    expect(data.pendingPantryDrawClueNumber).toBe(1);
    expect(data.pendingAccusationPenalty).toBeNull();
    expect(data.eliminatedSuspectIds).toEqual([]);

    store.acknowledgePantryDraw("ritual");
    store.makeAccusation("ritual", wrongAccusationFor(game.scenario.solution, { name: "Ada", suspectId: "S01" }));
    data = store.getGameData("ritual")!;
    expect(data.pendingPantryDrawClueNumber).toBeNull();
    expect(data.pendingAccusationPenalty).toMatchObject({ playerName: "Ada", wrongCount: 4 });
  });
});
