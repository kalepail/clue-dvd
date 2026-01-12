import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { gameStore } from "../hooks/useGameStore";
import { THEMES, DIFFICULTIES, PLAYER_COUNTS, SUSPECTS } from "../../shared/game-elements";
import type { Difficulty } from "../../types/campaign";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Label } from "@/client/components/ui/label";

interface Props {
  onClose: () => void;
  onCreated: (gameId: string) => void;
}

interface PlayerSetup {
  name: string;
  suspectId: string;
}

const suspectImageById: Record<string, string> = {
  S01: "/images/suspects/Miss_Scarlet.png",
  S02: "/images/suspects/Mustard.png",
  S03: "/images/suspects/Mrs._White.png",
  S04: "/images/suspects/Mr._Green.png",
  S05: "/images/suspects/Mrs_ Peacock.png",
  S06: "/images/suspects/Prof._Plum.png",
  S07: "/images/suspects/Mrs._Meadow-brook.png",
  S08: "/images/suspects/Prince_Azure.png",
  S09: "/images/suspects/Lady Lavendar.png",
  S10: "/images/suspects/Rusty.png",
};

const suspectColorById: Record<string, string> = {
  S01: "#da3f55",
  S02: "#dbad38",
  S03: "#e5e0da",
  S04: "#6c9376",
  S05: "#54539b",
  S06: "#7A29A3",
  S07: "#49aca7",
  S08: "#78abd8",
  S09: "#CB94F7",
  S10: "#d9673b",
};

const suspectOrderByRow = [
  "S01", // Miss Scarlet
  "S03", // Mrs. White
  "S05", // Mrs. Peacock
  "S07", // Mrs. Meadow-Brook
  "S09", // Lady Lavender
  "S02", // Colonel Mustard
  "S04", // Mr. Green
  "S06", // Professor Plum
  "S08", // Prince Azure
  "S10", // Rusty
];

const DEV_THEME_ID = "DEV01";
const DEV_PLAYERS: PlayerSetup[] = [
  { name: "Dev One", suspectId: "S01" },
  { name: "Dev Two", suspectId: "S02" },
  { name: "Dev Three", suspectId: "S03" },
];

function buildDefaultPlayers(count: number): PlayerSetup[] {
  return Array.from({ length: count }, () => ({
    name: "",
    suspectId: "",
  }));
}

function SuspectPickerCard({
  suspect,
  imageSrc,
  isSelected,
  isDisabled,
  color,
  onPick,
}: {
  suspect: { id: string; name: string };
  imageSrc: string;
  isSelected: boolean;
  isDisabled: boolean;
  color: string;
  onPick: () => void;
}) {
  const [imageOk, setImageOk] = useState(true);

  return (
    <button
      type="button"
      className={`suspect-select-card ${isSelected ? "is-selected" : ""}`}
      style={{ ["--suspect-color" as never]: color }}
      onClick={onPick}
      disabled={isDisabled}
      aria-pressed={isSelected}
      aria-label={`Select ${suspect.name}`}
    >
      <img
        className="suspect-select-image"
        src={imageSrc}
        alt={suspect.name}
        onError={() => setImageOk(false)}
      />
      {!imageOk && <span className="suspect-select-name">{suspect.name}</span>}
      {isDisabled && <span className="suspect-select-disabled">Taken</span>}
    </button>
  );
}

export default function NewGameModal({ onClose, onCreated }: Props) {
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [playerCount, setPlayerCount] = useState("3");
  const [players, setPlayers] = useState<PlayerSetup[]>(() => buildDefaultPlayers(3));
  const [pickerPlayerIndex, setPickerPlayerIndex] = useState<number | null>(null);
  const [pickerSelection, setPickerSelection] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleThemeChange = (value: string) => {
    setThemeId(value);
  };

  useEffect(() => {
    if (themeId !== DEV_THEME_ID) return;
    setPlayerCount("3");
    setPlayers(DEV_PLAYERS);
    setPickerPlayerIndex(null);
    setPickerSelection(null);
  }, [themeId]);

  const handlePlayerCountChange = (value: string) => {
    setPlayerCount(value);
    const nextCount = Number(value);
    setPlayers((current) => {
      if (current.length === nextCount) return current;
      if (current.length > nextCount) return current.slice(0, nextCount);
      return [...current, ...buildDefaultPlayers(nextCount - current.length)];
    });
  };

  const updatePlayer = (index: number, updates: Partial<PlayerSetup>) => {
    setPlayers((current) =>
      current.map((player, idx) => (idx === index ? { ...player, ...updates } : player))
    );
  };

  const openPicker = (index: number) => {
    setPickerPlayerIndex(index);
    setPickerSelection(players[index].suspectId || null);
  };

  const closePicker = () => {
    setPickerPlayerIndex(null);
    setPickerSelection(null);
  };

  const confirmPickerSelection = (suspectId: string) => {
    if (pickerPlayerIndex === null) return;
    updatePlayer(pickerPlayerIndex, { suspectId });
    closePicker();
  };

  const hasDuplicateSuspects = (list: PlayerSetup[]) => {
    const selections = list.map((p) => p.suspectId).filter(Boolean);
    return new Set(selections).size !== selections.length;
  };

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    const hasMissing = players.some((player) => !player.name.trim() || !player.suspectId);
    if (hasMissing) {
      setError("Please enter a name and choose a character for each player.");
      setCreating(false);
      return;
    }
    if (hasDuplicateSuspects(players)) {
      setError("Each player must choose a different character.");
      setCreating(false);
      return;
    }
    try {
      const game = await gameStore.createGame({
        themeId,
        difficulty,
        playerCount: Number(playerCount),
        players,
        useAI: false, // Set to true if AI enhancement is desired
      });
      onCreated(game.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    }
    setCreating(false);
  };

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-2xl">New Investigation</DialogTitle>
          <DialogDescription>
            Configure your mystery and begin the investigation at Tudor Mansion.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select value={themeId} onValueChange={handleThemeChange}>
              <SelectTrigger id="theme">
                <SelectValue placeholder="Select a theme" />
              </SelectTrigger>
              <SelectContent>
                {THEMES.map((theme) => (
                  <SelectItem key={theme.id} value={theme.id}>
                    {theme.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="difficulty">Difficulty</Label>
            <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
              <SelectTrigger id="difficulty">
                <SelectValue placeholder="Select difficulty" />
              </SelectTrigger>
              <SelectContent>
                {DIFFICULTIES.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} - {d.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="players">Players</Label>
            <Select value={playerCount} onValueChange={handlePlayerCountChange}>
              <SelectTrigger id="players">
                <SelectValue placeholder="Select player count" />
              </SelectTrigger>
              <SelectContent>
                {PLAYER_COUNTS.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} Player{n > 1 ? "s" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-4">
            <Label>Players & Characters</Label>
            {players.map((player, index) => {
              const playerNumber = index + 1;
              return (
                <div key={playerNumber} className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`player-name-${playerNumber}`}>
                      Player {playerNumber} Name
                    </Label>
                    <input
                      id={`player-name-${playerNumber}`}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      placeholder={`Player ${playerNumber}`}
                      value={player.name}
                      onChange={(event) =>
                        updatePlayer(index, { name: event.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`player-character-${playerNumber}`}>
                      Character
                    </Label>
                    <button
                      id={`player-character-${playerNumber}`}
                      type="button"
                      className="suspect-picker-trigger"
                      style={{
                        ["--suspect-color" as never]: player.suspectId
                          ? suspectColorById[player.suspectId]
                          : "transparent",
                      }}
                      onClick={() => openPicker(index)}
                    >
                      {player.suspectId ? (
                        <>
                          <img
                            className="suspect-picker-thumb"
                            src={suspectImageById[player.suspectId]}
                            alt={SUSPECTS.find((s) => s.id === player.suspectId)?.name || "Suspect"}
                          />
                          <span className="suspect-picker-name">
                            {SUSPECTS.find((s) => s.id === player.suspectId)?.name}
                          </span>
                        </>
                      ) : (
                        <span className="suspect-picker-placeholder">Select character</span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="text-destructive text-sm mb-4">{error}</div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <div className="loading-spinner mr-2" />
                Creating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Begin Investigation
              </>
            )}
          </Button>
        </DialogFooter>

        {pickerPlayerIndex !== null && (
          <div className="suspect-picker-overlay" role="dialog" aria-modal="true">
            <div
              className="suspect-picker-panel"
              style={{
                ["--suspect-color" as never]: pickerSelection
                  ? suspectColorById[pickerSelection]
                  : "#c4a35a",
              }}
            >
              <div className="suspect-picker-header">
                <div className="suspect-picker-title">Choose Your Character</div>
                <div className="suspect-picker-subtitle">
                  Tap once to preview, tap again to confirm.
                </div>
                <div
                  className="suspect-picker-selected"
                  style={{
                    ["--suspect-color" as never]: pickerSelection
                      ? suspectColorById[pickerSelection]
                      : "transparent",
                  }}
                >
                  {pickerSelection
                    ? SUSPECTS.find((s) => s.id === pickerSelection)?.name
                    : "No character selected"}
                </div>
              </div>

              <div className="suspect-select-grid" role="list">
                {suspectOrderByRow.map((suspectId) => {
                  const suspect = SUSPECTS.find((item) => item.id === suspectId);
                  if (!suspect) return null;
                  const isSelected = pickerSelection === suspect.id;
                  const isTaken = players
                    .map((p, idx) => (idx === pickerPlayerIndex ? "" : p.suspectId))
                    .filter(Boolean)
                    .includes(suspect.id);
                  const isDisabled = isTaken && !isSelected;
                  return (
                    <SuspectPickerCard
                      key={suspect.id}
                      suspect={suspect}
                      imageSrc={suspectImageById[suspect.id]}
                      isSelected={isSelected}
                      isDisabled={isDisabled}
                      color={suspectColorById[suspect.id]}
                      onPick={() =>
                        isSelected ? confirmPickerSelection(suspect.id) : setPickerSelection(suspect.id)
                      }
                    />
                  );
                })}
              </div>

              <div className="suspect-picker-actions">
                <Button variant="outline" onClick={closePicker}>
                  Cancel
                </Button>
                <Button
                  onClick={() => pickerSelection && confirmPickerSelection(pickerSelection)}
                  disabled={!pickerSelection}
                >
                  Confirm Selection
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
