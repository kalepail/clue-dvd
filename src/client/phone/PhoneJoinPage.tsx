import { useState } from "react";
import { SUSPECTS } from "../../shared/game-elements";
import { getSession, joinSession } from "./api";
import { storePlayer } from "./storage";
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
  const [error, setError] = useState<string | null>(null);

  const normalizedCode = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const takenSuspects = new Set(session?.players.map((player) => player.suspectId));

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

  return (
    <div className="phone-shell">
      <div className="phone-header">
        <h1>Detective Link</h1>
        <div className="phone-subtitle">
          Enter the lobby code shown on the host screen.
        </div>
      </div>

      <div className="phone-stack">
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
              <div className="phone-grid">
                {SUSPECTS.map((suspect) => {
                  const disabled = takenSuspects.has(suspect.id);
                  return (
                    <button
                      key={suspect.id}
                      type="button"
                      className={`phone-option ${suspectId === suspect.id ? "selected" : ""}`}
                      onClick={() => !disabled && setSuspectId(suspect.id)}
                      disabled={disabled}
                    >
                      <img src={suspectImageById[suspect.id]} alt={suspect.name} />
                      <div>{suspect.name}</div>
                      {disabled && <div className="phone-subtitle">Taken</div>}
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
