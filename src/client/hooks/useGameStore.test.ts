import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateScenarioWithPlan } from "../../services/scenario-generator";
import { ITEMS, LOCATIONS, SUSPECTS, TIMES } from "../../shared/game-elements";

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

describe("physical turn rituals", () => {
  it("waits for Pantry/payment acknowledgements, keeps identities private, and treats passages as movement", async () => {
    const { scenario } = generateScenarioWithPlan({ themeId: "DEV01", seed: 404 });
    const players = [
      { name: "Ada", suspectId: "S01" },
      { name: "Bert", suspectId: "S02" },
      { name: "Cy", suspectId: "S03" },
    ];
    storage.set("clue-dvd-games", JSON.stringify({
      ritual: {
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
      },
    }));

    const { GameStore } = await import("./useGameStore");
    const store = new GameStore();

    store.revealNextClue("ritual");
    expect(store.getGame("ritual")?.turnCount).toBe(0);
    expect(store.getGame("ritual")?.pendingPantryDrawClueNumber).toBe(1);
    expect(() => store.revealNextClue("ritual")).toThrow(/Pantry draw/i);
    store.acknowledgePantryDraw("ritual");
    expect(store.getGame("ritual")?.turnCount).toBe(1);
    expect(store.getGame("ritual")?.actions.find((action) => action.actionType === "pantry_draw_acknowledged")?.details)
      .toMatchObject({ identityTracked: false });

    const passage = store.useSecretPassage("ritual");
    expect(passage).toMatchObject({ outcome: "neutral" });
    expect(passage.description).toContain("movement, not your turn action");
    expect(() => store.useSecretPassage("ritual")).toThrow(/already used/i);

    expect(() => store.recordSuggestion("ritual", ["suspect", "item"])).toThrow(/exactly three/i);
    store.recordSuggestion("ritual", ["suspect", "location", "time"]);
    const suggestion = store.getGame("ritual")?.actions.find((action) => action.actionType === "suggestion_made");
    expect(suggestion?.details).toMatchObject({ cardIdentitiesTracked: false, omittedCategory: "item" });

    const solution = scenario.solution;
    const beforePayment = store.getGame("ritual")!.turnCount;
    const result = store.makeAccusation("ritual", {
      player: "Bert",
      playerSuspectId: "S02",
      suspectId: otherId(SUSPECTS.map((entry) => entry.id), solution.suspectId),
      itemId: otherId(ITEMS.map((entry) => entry.id), solution.itemId),
      locationId: otherId(LOCATIONS.map((entry) => entry.id), solution.locationId),
      timeId: otherId(TIMES.map((entry) => entry.id), solution.timeId),
    });
    expect(result.wrongCount).toBe(4);
    expect(store.getGame("ritual")?.turnCount).toBe(beforePayment);
    expect(store.getGame("ritual")?.pendingAccusationPenalty?.wrongCount).toBe(4);

    store.resolveAccusationPenalty("ritual", "paid");
    expect(store.getGame("ritual")?.turnCount).toBe(beforePayment + 1);
    const payment = store.getGame("ritual")?.actions.find((action) => action.actionType === "card_shown");
    expect(payment?.details).toMatchObject({ itemCardCount: 4, identitiesTracked: false });

    store.makeAccusation("ritual", {
      player: "Cy",
      playerSuspectId: "S03",
      suspectId: otherId(SUSPECTS.map((entry) => entry.id), solution.suspectId),
      itemId: otherId(ITEMS.map((entry) => entry.id), solution.itemId),
      locationId: otherId(LOCATIONS.map((entry) => entry.id), solution.locationId),
      timeId: otherId(TIMES.map((entry) => entry.id), solution.timeId),
    });
    store.resolveAccusationPenalty("ritual", "unable");
    expect(store.getGame("ritual")?.eliminatedSuspectIds).toContain("S03");
    expect(store.getGame("ritual")?.turnOrder.map((player) => player.suspectId)).not.toContain("S03");
    expect(store.getGame("ritual")?.actions.some((action) => action.actionType === "player_eliminated")).toBe(true);
  });
});
