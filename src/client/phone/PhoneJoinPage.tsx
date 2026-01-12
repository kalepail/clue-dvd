import { useEffect, useState } from "react";
import { SUSPECTS } from "../../shared/game-elements";
import { getSession, joinSession, reconnectSession } from "./api";
import { loadLastJoinedCode, loadStoredPlayer, storePlayer } from "./storage";
import { suspectImageById } from "./assets";
import type { PhoneSessionSummary } from "../../phone/types";
import "./phone.css";

interface Props {
  onNavigate: (path: string) => void;
}

export default function PhoneJoinPage({ onNavigate }: Props) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [suspectId, setSuspectId] = useState("");
  const [session, setSession] = useState<PhoneSessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [rejoinLoading, setRejoinLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejoinCode, setRejoinCode] = useState<string | null>(null);
  const [rejoinPlayer, setRejoinPlayer] = useState<{
    playerId: string;
    reconnectToken: string;
    name: string;
    suspectId: string;
  } | null>(null);

  const normalizedCode = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const takenSuspects = new Set(session?.players.map((player) => player.suspectId));
  const orderedSuspects = [
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
  ]
    .map((id) => SUSPECTS.find((suspect) => suspect.id === id))
    .filter((suspect): suspect is (typeof SUSPECTS)[number] => Boolean(suspect));
  const selectedSuspect = orderedSuspects.find((suspect) => suspect.id === suspectId);
  const selectedColorMap: Record<string, string> = {
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

  const handleCheckCode = async () => {
    if (normalizedCode.length !== 4) {
      setError("Enter the 4-character code from the host screen.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getSession(normalizedCode);
      setSession(data);
    } catch (err) {
      setSession(null);
      setError(err instanceof Error ? err.message : "Failed to load session.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const lastCode = loadLastJoinedCode();
    if (!lastCode) return;
    const stored = loadStoredPlayer(lastCode);
    if (!stored) return;
    setRejoinCode(lastCode);
    setRejoinPlayer(stored);
    if (!code) {
      setCode(lastCode);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await getSession(session.session.code);
        setSession(data);
      } catch {
        // Keep last known state if polling fails.
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [session?.session.code]);

  const handleJoin = async () => {
    if (!session || !name.trim() || !suspectId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await joinSession(session.session.code, name.trim(), suspectId);
      storePlayer(session.session.code, {
        playerId: response.player.id,
        reconnectToken: response.reconnectToken,
        name: response.player.name,
        suspectId: response.player.suspectId,
      });
      onNavigate(`/phone/session/${session.session.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join session.");
    } finally {
      setLoading(false);
    }
  };

  const handleRejoin = async () => {
    if (!rejoinCode || !rejoinPlayer) return;
    setRejoinLoading(true);
    setError(null);
    try {
      const data = await reconnectSession(rejoinCode, rejoinPlayer.reconnectToken);
      storePlayer(rejoinCode, {
        playerId: data.player.id,
        reconnectToken: data.reconnectToken,
        name: data.player.name,
        suspectId: data.player.suspectId,
      });
      onNavigate(`/phone/session/${rejoinCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reconnect.");
    } finally {
      setRejoinLoading(false);
    }
  };

  const [imageOkById, setImageOkById] = useState<Record<string, boolean>>({});

  return (
    <div className="phone-shell">
      <div className="phone-header">
        <h1>Detective Link</h1>
        <div className="phone-subtitle">
          Enter the lobby code shown on the host screen.
        </div>
      </div>

      <div className="phone-stack">
        {rejoinPlayer && (
          <div className="phone-card phone-stack">
            <div className="phone-section-title">Resume Detective</div>
            <div className="phone-subtitle">
              {rejoinPlayer.name} · {rejoinPlayer.suspectId}
            </div>
            <button
              type="button"
              className="phone-button"
              onClick={handleRejoin}
              disabled={rejoinLoading}
            >
              {rejoinLoading ? "Rejoining..." : "Rejoin Game"}
            </button>
          </div>
        )}
        <div className="phone-card phone-stack">
          <div className="phone-field">
            <label htmlFor="code">Join Code</label>
            <input
              id="code"
              className="phone-input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="AB12"
              maxLength={6}
            />
          </div>
          <button
            type="button"
            className="phone-button secondary"
            onClick={handleCheckCode}
            disabled={loading}
          >
            {loading ? "Checking..." : "Check Code"}
          </button>
        </div>

        {session && (
          <div className="phone-card phone-stack">
            <div className="phone-field">
              <label htmlFor="name">Detective Name</label>
              <input
                id="name"
                className="phone-input"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
              />
            </div>

            <div>
              <div className="phone-section-title">Choose Your Suspect</div>
              {selectedSuspect && (
                <div className="mb-2 phone-selection-center">
                  <span
                    className="phone-selection-badge"
                    style={{ color: selectedColorMap[selectedSuspect.id] || "var(--color-gold)" }}
                  >
                    {selectedSuspect.name}
                  </span>
                </div>
              )}
              <div className="phone-grid phone-grid-suspects">
                {orderedSuspects.map((suspect) => {
                  const disabled = takenSuspects.has(suspect.id);
                  return (
                    <button
                      key={suspect.id}
                      type="button"
                      className={`phone-option phone-option-suspect ${suspectId === suspect.id ? "selected" : ""}`}
                      onClick={() => !disabled && setSuspectId(suspect.id)}
                      disabled={disabled}
                    >
                      <img
                        src={suspectImageById[suspect.id]}
                        alt={suspect.name}
                        onError={() =>
                          setImageOkById((current) => ({ ...current, [suspect.id]: false }))
                        }
                      />
                      {imageOkById[suspect.id] === false && (
                        <div>{suspect.name}</div>
                      )}
                      {disabled && <span className="phone-taken-badge">Taken</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              className="phone-button"
              onClick={handleJoin}
              disabled={loading || !name.trim() || !suspectId}
            >
              Join the Table
            </button>
          </div>
        )}

        {error && (
          <div className="phone-card">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
