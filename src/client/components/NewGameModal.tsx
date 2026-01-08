import { useState, useEffect } from "react";
import { api } from "../hooks/useApi";

interface Stats {
  gameElements: {
    themes: number;
  };
}

interface Props {
  onClose: () => void;
  onCreated: (gameId: string) => void;
}

const THEMES = [
  { id: "classic_theft", name: "Classic Theft" },
  { id: "art_heist", name: "Art Heist" },
  { id: "jewel_theft", name: "Jewel Theft" },
  { id: "blackmail", name: "Blackmail Scheme" },
  { id: "inheritance_fraud", name: "Inheritance Fraud" },
  { id: "smuggling_ring", name: "Smuggling Ring" },
  { id: "espionage", name: "Espionage" },
  { id: "counterfeit_scheme", name: "Counterfeit Scheme" },
  { id: "revenge_plot", name: "Revenge Plot" },
  { id: "love_triangle", name: "Love Triangle" },
  { id: "political_scandal", name: "Political Scandal" },
  { id: "secret_society", name: "Secret Society" },
];

const DIFFICULTIES = [
  { id: "novice", name: "Novice", description: "More clues, easier deduction" },
  { id: "intermediate", name: "Intermediate", description: "Balanced challenge" },
  { id: "expert", name: "Expert", description: "Fewer clues, harder deduction" },
];

export default function NewGameModal({ onClose, onCreated }: Props) {
  const [themeId, setThemeId] = useState("classic_theft");
  const [difficulty, setDifficulty] = useState("intermediate");
  const [playerCount, setPlayerCount] = useState(3);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setCreating(true);
    setError(null);
    try {
      const result = await api.createGame({ themeId, difficulty, playerCount });
      if ((result as { game?: { id: string } }).game?.id) {
        onCreated((result as { game: { id: string } }).game.id);
      } else {
        throw new Error("Failed to create game");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create game");
    }
    setCreating(false);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: "500px", width: "90%" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-header">
          <h2>New Investigation</h2>
        </div>

        <div className="form-group">
          <label>Theme</label>
          <select value={themeId} onChange={(e) => setThemeId(e.target.value)}>
            {THEMES.map((theme) => (
              <option key={theme.id} value={theme.id}>
                {theme.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Difficulty</label>
          <select
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            {DIFFICULTIES.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} - {d.description}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>Players</label>
          <select
            value={playerCount}
            onChange={(e) => setPlayerCount(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n} Player{n > 1 ? "s" : ""}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <div style={{ color: "var(--color-accent-red)", marginBottom: "1rem" }}>
            {error}
          </div>
        )}

        <div className="flex gap-2" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={onClose} disabled={creating}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? "Creating..." : "Begin Investigation"}
          </button>
        </div>
      </div>
    </div>
  );
}
