import { useState, useEffect } from "react";
import { api } from "../hooks/useApi";

interface GameAction {
  sequenceNumber: number;
  actor: string;
  actionType: string;
  details: string;
  clueIndex?: number;
}

interface Props {
  gameId: string;
}

export default function GameHistory({ gameId }: Props) {
  const [history, setHistory] = useState<GameAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true);
      try {
        const data = await api.getGameHistory(gameId);
        setHistory((data as { history: GameAction[] }).history || []);
      } catch (err) {
        console.error("Failed to load history:", err);
      }
      setLoading(false);
    };
    loadHistory();
  }, [gameId]);

  if (loading) {
    return <div className="text-muted">Loading history...</div>;
  }

  if (history.length === 0) {
    return <div className="text-muted">No actions recorded yet.</div>;
  }

  const formatActionType = (type: string) => {
    return type.replace(/_/g, " ");
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case "game_started":
        return "▶";
      case "clue_revealed":
        return "🔍";
      case "accusation_made":
        return "⚖";
      case "accusation_correct":
        return "✓";
      case "accusation_wrong":
        return "✗";
      case "dramatic_event":
        return "⚡";
      default:
        return "•";
    }
  };

  return (
    <div style={{ maxHeight: "400px", overflow: "auto" }}>
      {history.map((action) => (
        <div key={action.sequenceNumber} className="history-item">
          <span className="history-sequence">{getActionIcon(action.actionType)}</span>
          <div>
            <div>
              <span className="history-actor">{action.actor}</span>
              <span className="text-muted"> — {formatActionType(action.actionType)}</span>
            </div>
            <div className="history-details">{action.details}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
