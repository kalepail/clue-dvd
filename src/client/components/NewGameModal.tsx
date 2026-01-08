import { useState } from "react";
import { Sparkles } from "lucide-react";
import { gameStore } from "../hooks/useGameStore";
import { THEMES, DIFFICULTIES, PLAYER_COUNTS } from "../../shared/game-elements";
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

export default function NewGameModal({ onClose, onCreated }: Props) {
  const [themeId, setThemeId] = useState(THEMES[0].id);
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [playerCount, setPlayerCount] = useState("3");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const game = await gameStore.createGame({
        themeId,
        difficulty,
        playerCount: Number(playerCount),
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
            <Select value={playerCount} onValueChange={setPlayerCount}>
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
