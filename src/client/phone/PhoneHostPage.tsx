import { useEffect, useRef, useState } from "react";
import { closeSession, createSession } from "./api";
import { clearHostSessionCode, storeHostSessionCode } from "./storage";
import { gameStore } from "../hooks/useGameStore";
import type { PhoneSessionSummary } from "../../phone/types";
import { connectPhoneSessionSocket } from "./ws";
import "./phone.css";

interface Props {
  onNavigate: (path: string) => void;
}

export default function PhoneHostPage({ onNavigate }: Props) {
  const [session, setSession] = useState<PhoneSessionSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastEventId, setLastEventId] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const sessionRef = useRef<PhoneSessionSummary | null>(null);
  const lastEventIdRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const boot = async () => {
      try {
        const created = await createSession();
        if (alive) {
          setSession(created);
          storeHostSessionCode(created.session.code);
          setLoading(false);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : "Failed to create session");
          setLoading(false);
        }
      }
    };
    boot();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  useEffect(() => {
    if (!session?.session.code) return;
    const disconnect = connectPhoneSessionSocket(
      session.session.code,
      {
        onSession: (data) => {
          setSession(data);
        },
        onEvent: async (event) => {
          lastEventIdRef.current = event.id;
          setLastEventId(event.id);
          if (event.type === "turn_action" && event.payload.action === "start_game") {
            const currentSession = sessionRef.current;
            if (!currentSession) return;
            const themeId = typeof event.payload.themeId === "string" && event.payload.themeId.length > 0
              ? event.payload.themeId
              : undefined;
            const difficulty =
              typeof event.payload.difficulty === "string" ? event.payload.difficulty : "expert";
            const players = currentSession.players.map((player) => ({
              name: player.name,
              suspectId: player.suspectId,
            }));
            if (players.length === 0) {
              setError("No players joined the phone lobby yet.");
              return;
            }
            const game = await gameStore.createGame({
              themeId,
              difficulty: difficulty as "beginner" | "intermediate" | "expert",
              playerCount: players.length,
              players,
              useAI: false,
              phoneSessionCode: currentSession.session.code,
            });
            onNavigate(`/game/${game.id}`);
          }
        },
      },
      {
        getLastEventId: () => lastEventIdRef.current,
      }
    );
    return () => disconnect();
  }, [session?.session.code, onNavigate]);

  if (loading) {
    return (
      <div className="phone-shell">
        <div className="phone-card">Creating host lobby...</div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="phone-shell">
        <div className="phone-card">
          <p className="text-sm text-destructive">{error || "Session unavailable"}</p>
        </div>
      </div>
    );
  }

  const handleClose = async () => {
    setClosing(true);
    try {
      await closeSession(session.session.code);
      clearHostSessionCode();
      onNavigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close session");
    } finally {
      setClosing(false);
    }
  };

  return (
    <div className="phone-shell">
      <div className="phone-header">
        <h1>Host Lobby</h1>
        <div className="phone-subtitle">
          Players join at <span className="phone-pill">#/phone</span>
        </div>
      </div>

      <div className="phone-stack">
        <div className="phone-card phone-stack">
          <div className="phone-section-title">Join Code</div>
          <div style={{ fontSize: "2.4rem", letterSpacing: "0.4em", fontFamily: "var(--font-display)" }}>
            {session.session.code}
          </div>
          <button
            type="button"
            className="phone-button secondary"
            onClick={() => navigator.clipboard.writeText(session.session.code)}
          >
            Copy Code
          </button>
        </div>

        <div className="phone-card phone-stack">
          <div className="phone-section-title">Players Joined</div>
          {session.players.length === 0 ? (
            <div className="phone-subtitle">Waiting for detectives...</div>
          ) : (
            <div className="phone-stack">
              {session.players.map((player) => (
                <div key={player.id} className="phone-card">
                  <strong>{player.name}</strong> · {player.suspectId}
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            className="phone-button"
            onClick={() => onNavigate("/")}
          >
            Return to Main Site
          </button>
          <button
            type="button"
            className="phone-button secondary"
            onClick={handleClose}
            disabled={closing}
          >
            {closing ? "Ending Session..." : "End Phone Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
