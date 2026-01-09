import { useState } from "react";
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

function buildDefaultPlayers(count: number): PlayerSetup[] {
  return Array.from({ length: count }, () => ({
    name: "",
    suspectId: "",
  }));
}

export default function NewGameModal({ onClose, onCreated }: Props) {
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [playerCount, setPlayerCount] = useState("3");
  const [players, setPlayers] = useState<PlayerSetup[]>(() => buildDefaultPlayers(3));
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
            <Select value={themeId} onValueChange={setThemeId}>
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
              const selectedSuspects = players
                .map((p, idx) => (idx === index ? "" : p.suspectId))
                .filter(Boolean);
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
                    <Select
                      value={player.suspectId}
                      onValueChange={(value) => updatePlayer(index, { suspectId: value })}
                    >
                      <SelectTrigger id={`player-character-${playerNumber}`}>
                        <SelectValue placeholder="Select a character" />
                      </SelectTrigger>
                      <SelectContent>
                        {SUSPECTS.map((suspect) => (
                          <SelectItem
                            key={suspect.id}
                            value={suspect.id}
                            disabled={selectedSuspects.includes(suspect.id)}
                          >
                            {suspect.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
      </DialogContent>
    </Dialog>
  );
}
