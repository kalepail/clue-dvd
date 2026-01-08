import { useState, useEffect, useCallback } from "react";
import { api } from "../hooks/useApi";
import ClueDisplay from "../components/ClueDisplay";
import AccusationPanel from "../components/AccusationPanel";
import EliminationTracker from "../components/EliminationTracker";
import GameHistory from "../components/GameHistory";

interface GameData {
  id: string;
  status: string;
  theme: { id: string; name: string; motive: string };
  difficulty: string;
  playerCount: number;
  createdAt: string;
  state: {
    currentClueIndex: number;
    eliminatedSuspects: string[];
    eliminatedItems: string[];
    eliminatedLocations: string[];
    eliminatedTimes: string[];
    phase: string;
    wrongAccusations: number;
  };
  clues: Array<{
    speaker: string;
    text: string;
    eliminates: { type: string; id: string };
  }>;
  solution?: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  };
}

interface Props {
  gameId: string;
  onNavigate: (path: string) => void;
}

export default function GamePage({ gameId, onNavigate }: Props) {
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealingClue, setRevealingClue] = useState(false);
  const [latestClue, setLatestClue] = useState<{
    speaker: string;
    text: string;
    eliminated?: { type: string; id: string };
  } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAccusation, setShowAccusation] = useState(false);

  const loadGame = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getGame(gameId);
      if ((data as { error?: string }).error) {
        setError((data as { error: string }).error);
      } else {
        setGame(data as GameData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load game");
    }
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  const handleStartGame = async () => {
    try {
      await api.startGame(gameId);
      loadGame();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
    }
  };

  const handleRevealClue = async () => {
    setRevealingClue(true);
    setLatestClue(null);
    try {
      const result = await api.revealNextClue(gameId);
      if ((result as { error?: string }).error) {
        setError((result as { error: string }).error);
      } else {
        const clueData = result as {
          clue?: { speaker: string; enhancedText: string };
          eliminated?: { type: string; id: string };
        };
        if (clueData.clue) {
          setLatestClue({
            speaker: clueData.clue.speaker,
            text: clueData.clue.enhancedText,
            eliminated: clueData.eliminated,
          });
        }
        loadGame();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reveal clue");
    }
    setRevealingClue(false);
  };

  const handleAccusation = async (accusation: {
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  }) => {
    try {
      const result = await api.makeAccusation(gameId, {
        player: "Detective",
        ...accusation,
      });
      loadGame();
      setShowAccusation(false);
      return result as {
        correct: boolean;
        message: string;
        aiResponse?: string;
      };
    } catch (err) {
      return { correct: false, message: "Failed to make accusation" };
    }
  };

  if (loading) {
    return <div className="loading">Loading investigation...</div>;
  }

  if (error || !game) {
    return (
      <div className="card text-center">
        <h3>Investigation Not Found</h3>
        <p className="text-muted mt-1">{error || "This case file cannot be located"}</p>
        <button className="btn mt-2" onClick={() => onNavigate("/")}>
          Return to Case Files
        </button>
      </div>
    );
  }

  const isSetup = game.status === "setup";
  const isInProgress = game.status === "in_progress";
  const isSolved = game.status === "solved";
  const cluesRemaining = game.clues.length - game.state.currentClueIndex;
  const progress = (game.state.currentClueIndex / game.clues.length) * 100;

  return (
    <div>
      {/* Header */}
      <div className="card">
        <div className="flex flex-between">
          <div>
            <h2>{game.theme.name}</h2>
            <p className="text-muted">{game.theme.motive}</p>
          </div>
          <span className={`badge badge-${game.status.replace("_", "-")}`}>
            {game.status.replace("_", " ")}
          </span>
        </div>

        {isInProgress && (
          <div className="mt-2">
            <div className="flex flex-between text-muted" style={{ fontSize: "0.85rem" }}>
              <span>Clues Revealed: {game.state.currentClueIndex} / {game.clues.length}</span>
              <span>{cluesRemaining} remaining</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Setup Phase */}
      {isSetup && (
        <div className="card text-center">
          <h3>The Mystery Awaits</h3>
          <p className="text-muted mt-1">
            A theft has occurred at Tudor Mansion. Someone has stolen something valuable.
            Your task is to determine WHO did it, WHAT they stole, WHERE it happened, and WHEN.
          </p>
          <div className="mt-2">
            <div className="text-muted mb-2">
              Difficulty: {game.difficulty} | Players: {game.playerCount} | Clues: {game.clues.length}
            </div>
            <button className="btn btn-primary" onClick={handleStartGame}>
              Begin Investigation
            </button>
          </div>
        </div>
      )}

      {/* Active Game */}
      {isInProgress && (
        <div className="two-columns">
          <div>
            {/* Latest Clue */}
            {latestClue && (
              <div className="card" style={{ borderColor: "var(--color-gold)" }}>
                <h3 className="mb-2">Latest Clue</h3>
                <ClueDisplay
                  speaker={latestClue.speaker}
                  text={latestClue.text}
                  eliminated={latestClue.eliminated}
                  index={game.state.currentClueIndex}
                />
              </div>
            )}

            {/* Controls */}
            <div className="card">
              <div className="flex gap-2" style={{ flexWrap: "wrap" }}>
                <button
                  className="btn btn-primary"
                  onClick={handleRevealClue}
                  disabled={revealingClue || cluesRemaining === 0}
                >
                  {revealingClue ? "Revealing..." : "Reveal Next Clue"}
                </button>
                <button
                  className="btn btn-success"
                  onClick={() => setShowAccusation(true)}
                >
                  Make Accusation
                </button>
                <button
                  className="btn"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  {showHistory ? "Hide History" : "View History"}
                </button>
              </div>

              {game.state.wrongAccusations > 0 && (
                <p className="text-muted mt-2" style={{ color: "var(--color-accent-red)" }}>
                  Wrong accusations: {game.state.wrongAccusations}
                </p>
              )}
            </div>

            {/* History */}
            {showHistory && (
              <div className="card">
                <h3 className="mb-2">Investigation History</h3>
                <GameHistory gameId={gameId} />
              </div>
            )}
          </div>

          {/* Elimination Tracker */}
          <div>
            <EliminationTracker state={game.state} />
          </div>
        </div>
      )}

      {/* Solved */}
      {isSolved && game.solution && (
        <div className="card text-center" style={{ borderColor: "var(--color-accent-green)" }}>
          <h2 style={{ color: "var(--color-accent-green)" }}>Case Solved!</h2>
          <div className="mt-2">
            <p>The mystery has been unraveled. The truth is revealed:</p>
            <div className="mt-2" style={{ fontSize: "1.2rem" }}>
              <p><strong>Who:</strong> {game.solution.suspectId}</p>
              <p><strong>What:</strong> {game.solution.itemId}</p>
              <p><strong>Where:</strong> {game.solution.locationId}</p>
              <p><strong>When:</strong> {game.solution.timeId}</p>
            </div>
          </div>
          <button className="btn mt-3" onClick={() => onNavigate("/")}>
            Return to Case Files
          </button>
        </div>
      )}

      {/* Accusation Modal */}
      {showAccusation && (
        <AccusationPanel
          state={game.state}
          onClose={() => setShowAccusation(false)}
          onAccuse={handleAccusation}
        />
      )}
    </div>
  );
}
