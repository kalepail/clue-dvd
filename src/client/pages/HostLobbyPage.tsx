import { useEffect, useRef, useState } from "react";
import { Users, RefreshCw, X, Smartphone } from "lucide-react";
import { gameStore } from "../hooks/useGameStore";
import { createSession, closeSession } from "../phone/api";
import type { PhoneSessionSummary } from "../../phone/types";
import {
  clearHostSessionCode,
  consumeHostAutoCreate,
  storeHostSessionCode,
} from "../phone/storage";
import { DEV_PHONE_JOIN_HOST } from "../phone/phone-config";
import { Button } from "@/client/components/ui/button";
import { connectPhoneSessionSocket } from "../phone/ws";

interface Props {
  onNavigate: (path: string) => void;
}

export default function HostLobbyPage({ onNavigate }: Props) {
  const [session, setSession] = useState<PhoneSessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<number | null>(null);
  const sessionRef = useRef<PhoneSessionSummary | null>(null);
  const lastEventIdRef = useRef<number | null>(null);
  const buildJoinUrl = () => {
    const { protocol, hostname, port } = window.location;
    const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
    const host = isLocal ? DEV_PHONE_JOIN_HOST : hostname;
    const portPart = port ? `:${port}` : "";
    return `${protocol}//${host}${portPart}/#/phone`;
  };
  const joinUrl = buildJoinUrl();

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    lastEventIdRef.current = lastEventId;
  }, [lastEventId]);

  useEffect(() => {
    if (session) return;
    if (consumeHostAutoCreate()) {
      handleCreateLobby();
      return;
    }
    clearHostSessionCode();
  }, [session]);

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
              typeof event.payload.difficulty === "string" ? event.payload.difficulty : "intermediate";
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

  const handleCreateLobby = async () => {
    setLoading(true);
    setError(null);
    try {
      const created = await createSession();
      storeHostSessionCode(created.session.code);
      setSession(created);
      setLastEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create phone lobby");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseLobby = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await closeSession(session.session.code);
      clearHostSessionCode();
      setSession(null);
      setLastEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await closeSession(session.session.code);
      clearHostSessionCode();
      const created = await createSession();
      storeHostSessionCode(created.session.code);
      setSession(created);
      setLastEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate code");
    } finally {
      setLoading(false);
    }
  };

  const sortedPlayers = session
    ? [...session.players].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    : [];
  const playerCount = sortedPlayers.length;
  const gridClass =
    playerCount <= 3 ? "host-lobby-grid host-lobby-grid-1" : "host-lobby-grid host-lobby-grid-5";
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

  return (
    <div className="lobby-page">
      {/* Header */}
      <header className="lobby-header">
        <div className="lobby-header-inner">
          <div className="lobby-header-corner lobby-header-corner-tl" />
          <div className="lobby-header-corner lobby-header-corner-tr" />

          <div className="lobby-header-deco-line" />

          <div className="lobby-header-content">
            <div className="lobby-header-top-row">
              <button
                onClick={() => onNavigate("/")}
                className="lobby-back-button"
              >
                &larr; Return to Investigations
              </button>
              <div className="lobby-header-title-wrap">
                <span className="lobby-header-label">Detective Assembly</span>
                <h1 className="lobby-header-title">Phone Lobby</h1>
              </div>
              <div className="lobby-header-spacer" aria-hidden="true" />
            </div>
            <div className="lobby-header-divider">
              <span className="lobby-header-divider-line" />
              <span className="lobby-header-divider-diamond" />
              <span className="lobby-header-divider-line" />
            </div>
            <p className="lobby-header-subtitle">
              Summon your fellow investigators
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="lobby-main">
        {!session ? (
          /* No Session - Create Lobby */
          <div className="lobby-create-section">
            <div className="lobby-create-card">
              <div className="lobby-create-icon">
                <Smartphone className="w-12 h-12" />
              </div>
              <h2 className="lobby-create-title">Begin Assembly</h2>
              <p className="lobby-create-description">
                Generate a secret code for detectives to join from their phones.
                The lead detective will start the investigation when ready.
              </p>
              <Button
                onClick={handleCreateLobby}
                disabled={loading}
                className="lobby-create-button"
              >
                {loading ? "Generating Code..." : "Create Phone Lobby"}
              </Button>
              {error && <p className="lobby-error">{error}</p>}
            </div>
          </div>
        ) : (
          /* Active Session */
          <div className="lobby-active">
            {/* Join Code Section */}
            <section className="lobby-code-section">
              <div className="lobby-code-card">
                <div className="lobby-code-header">
                  <span className="lobby-code-label">Secret Access Code</span>
                </div>

                <div className="lobby-code-display">
                  <div className="lobby-code-corners">
                    <span className="lobby-code-corner lobby-code-corner-tl" />
                    <span className="lobby-code-corner lobby-code-corner-tr" />
                    <span className="lobby-code-corner lobby-code-corner-bl" />
                    <span className="lobby-code-corner lobby-code-corner-br" />
                  </div>
                  <span className="lobby-code-value">{session.session.code}</span>
                </div>

                <div className="lobby-code-instructions">
                  <div className="lobby-code-url">
                    <span className="lobby-code-url-label">Visit</span>
                    <span className="lobby-code-url-value">{joinUrl}</span>
                  </div>
                  <p className="lobby-code-hint">
                    Detectives enter this code on their phones to join
                  </p>
                </div>

                <div className="lobby-code-actions">
                  <button
                    onClick={handleRegenerateCode}
                    disabled={loading}
                    className="lobby-action-button"
                  >
                    <RefreshCw className="w-4 h-4" />
                    New Code
                  </button>
                  <button
                    onClick={handleCloseLobby}
                    disabled={loading}
                    className="lobby-action-button lobby-action-button-danger"
                  >
                    <X className="w-4 h-4" />
                    End Session
                  </button>
                </div>

                {error && <p className="lobby-error">{error}</p>}
              </div>
            </section>

            {/* Detectives Section */}
            <section className="lobby-detectives-section">
              <div className="lobby-detectives-header">
                <div className="lobby-detectives-divider">
                  <span className="lobby-detectives-divider-line" />
                  <span className="lobby-detectives-divider-text">Assembled Detectives</span>
                  <span className="lobby-detectives-divider-line" />
                </div>
                <p className="lobby-detectives-hint">
                  Lead detective can start the game from their phone
                </p>
              </div>

              {sortedPlayers.length === 0 ? (
                <div className="lobby-waiting">
                  <div className="lobby-waiting-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p>Awaiting detectives...</p>
                </div>
              ) : (
                <div className={gridClass}>
                  {sortedPlayers.map((player, index) => (
                    <div key={player.id} className="lobby-detective-card">
                      {index === 0 && (
                        <span className="lobby-detective-lead-badge">Lead</span>
                      )}
                      <div className="lobby-detective-portrait">
                        <img
                          src={suspectImageById[player.suspectId]}
                          alt={player.suspectName}
                        />
                      </div>
                      <div className="lobby-detective-info">
                        <span className="lobby-detective-name">
                          <Users className="w-3.5 h-3.5" />
                          {player.name}
                        </span>
                        <span className="lobby-detective-suspect">
                          {player.suspectName}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="lobby-footer">
        <div className="lobby-footer-deco">
          <span className="lobby-footer-deco-line" />
          <span className="lobby-footer-deco-diamond" />
          <span className="lobby-footer-deco-line" />
        </div>
        <p className="lobby-footer-text">Tudor Mansion &bull; 1926</p>
      </footer>
    </div>
  );
}
