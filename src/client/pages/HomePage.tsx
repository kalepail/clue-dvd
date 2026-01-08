import { useState, useEffect } from "react";
import { api } from "../hooks/useApi";
import NewGameModal from "../components/NewGameModal";

interface Game {
  id: string;
  status: string;
  theme: { id: string; name: string };
  difficulty: string;
  playerCount: number;
  createdAt: string;
  clueCount: number;
}

interface Props {
  onNavigate: (path: string) => void;
}

export default function HomePage({ onNavigate }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewGame, setShowNewGame] = useState(false);

  const loadGames = async () => {
    setLoading(true);
    try {
      const data = await api.listGames();
      setGames((data as { games: Game[] }).games || []);
    } catch (err) {
      console.error("Failed to load games:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadGames();
  }, []);

  const handleGameCreated = (gameId: string) => {
    setShowNewGame(false);
    onNavigate(`/game/${gameId}`);
  };

  const getStatusBadge = (status: string) => {
    return <span className={`badge badge-${status.replace("_", "-")}`}>{status.replace("_", " ")}</span>;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div>
      <div className="flex flex-between mb-3">
        <h2>Your Investigations</h2>
        <button className="btn btn-primary" onClick={() => setShowNewGame(true)}>
          New Game
        </button>
      </div>

      {loading ? (
        <div className="loading">Loading investigations...</div>
      ) : games.length === 0 ? (
        <div className="card text-center">
          <h3>No Investigations Yet</h3>
          <p className="text-muted mt-1">
            Begin your first mystery at Tudor Mansion
          </p>
          <button
            className="btn btn-primary mt-2"
            onClick={() => setShowNewGame(true)}
          >
            Start New Investigation
          </button>
        </div>
      ) : (
        <div className="game-grid">
          {games.map((game) => (
            <div
              key={game.id}
              className="card"
              style={{ cursor: "pointer" }}
              onClick={() => onNavigate(`/game/${game.id}`)}
            >
              <div className="flex flex-between mb-1">
                {getStatusBadge(game.status)}
                <span className="text-muted" style={{ fontSize: "0.8rem" }}>
                  {formatDate(game.createdAt)}
                </span>
              </div>
              <h3 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
                {game.theme.name}
              </h3>
              <div className="text-muted" style={{ fontSize: "0.85rem" }}>
                <div>Difficulty: {game.difficulty}</div>
                <div>Players: {game.playerCount}</div>
                <div>Clues: {game.clueCount}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNewGame && (
        <NewGameModal
          onClose={() => setShowNewGame(false)}
          onCreated={handleGameCreated}
        />
      )}
    </div>
  );
}
