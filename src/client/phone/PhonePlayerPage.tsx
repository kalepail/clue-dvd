import { useEffect, useMemo, useState } from "react";
import { DIFFICULTIES, ITEMS, LOCATIONS, SUSPECTS, THEMES, TIMES } from "../../shared/game-elements";
import type { EliminationState } from "../../shared/api-types";
import type { PhonePlayer, PhoneSessionSummary } from "../../phone/types";
import { getSession, reconnectSession, sendPlayerAction, updatePlayer } from "./api";
import { clearStoredPlayer, loadStoredPlayer } from "./storage";
import {
  itemImageById,
  locationImageById,
  suspectImageById,
  timeImageById,
} from "./assets";
import "./phone.css";

interface Props {
  code: string;
  onNavigate: (path: string) => void;
}

type PhoneTab = "notes" | "eliminations" | "turn" | "accusation";

const emptyEliminations: EliminationState = {
  suspects: [],
  items: [],
  locations: [],
  times: [],
};

export default function PhonePlayerPage({ code, onNavigate }: Props) {
  const [session, setSession] = useState<PhoneSessionSummary | null>(null);
  const [player, setPlayer] = useState<PhonePlayer | null>(null);
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<PhoneTab>("notes");
  const [notes, setNotes] = useState("");
  const [eliminations, setEliminations] = useState<EliminationState>(emptyEliminations);
  const [saving, setSaving] = useState(false);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [accusation, setAccusation] = useState({
    suspectId: "",
    itemId: "",
    locationId: "",
    timeId: "",
  });
  const [themeId, setThemeId] = useState("");
  const [difficulty, setDifficulty] = useState("intermediate");

  useEffect(() => {
    const stored = loadStoredPlayer(code);
    if (!stored) {
      setActionStatus("No saved player found. Join again.");
      return;
    }

    const reconnect = async () => {
      try {
        const data = await reconnectSession(code, stored.reconnectToken);
        setSession({ session: data.session, players: [] });
        setPlayer(data.player);
        setToken(data.reconnectToken);
        setNotes(data.player.notes || "");
        setEliminations(data.player.eliminations || emptyEliminations);
      } catch (err) {
        setActionStatus(err instanceof Error ? err.message : "Failed to reconnect.");
      }
    };

    reconnect();
  }, [code]);

  useEffect(() => {
    if (!player) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await getSession(code);
        if (data.session.status === "closed") {
          clearStoredPlayer(code);
          onNavigate("/phone");
          return;
        }
        setSession(data);
      } catch {
        // Keep the last known roster if polling fails.
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [code, player]);

  useEffect(() => {
    if (!player || !token) return;
    const timeout = window.setTimeout(async () => {
      try {
        setSaving(true);
        await updatePlayer(player.id, token, { notes });
      } catch {
        // Keep local notes even if save fails.
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => window.clearTimeout(timeout);
  }, [notes, player, token]);

  const toggleElimination = (category: keyof EliminationState, id: string) => {
    if (!player || !token) return;
    setEliminations((prev) => {
      const list = prev[category];
      const next = list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
      const updated = { ...prev, [category]: next };
      updatePlayer(player.id, token, { eliminations: updated }).catch(() => undefined);
      return updated;
    });
  };

  const sendAction = async (action: string) => {
    if (!player || !token) return;
    setActionStatus("Sending to host...");
    try {
      await sendPlayerAction(player.id, token, "turn_action", { action });
      setActionStatus(`Sent: ${action}`);
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Failed to send action.");
    }
  };

  const submitAccusation = async () => {
    if (!player || !token) return;
    const { suspectId, itemId, locationId, timeId } = accusation;
    if (!suspectId || !itemId || !locationId || !timeId) {
      setActionStatus("Select WHO, WHAT, WHERE, and WHEN before submitting.");
      return;
    }
    setActionStatus("Submitting accusation...");
    try {
      await sendPlayerAction(player.id, token, "accusation", accusation);
      setActionStatus("Accusation sent to host.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Failed to submit accusation.");
    }
  };

  const startGame = async () => {
    if (!player || !token) return;
    setActionStatus("Starting game...");
    try {
      await sendPlayerAction(player.id, token, "turn_action", {
        action: "start_game",
        themeId: themeId || null,
        difficulty,
      });
      setActionStatus("Waiting for host to launch the game.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Failed to start game.");
    }
  };

  const tabs = useMemo(
    () => [
      { key: "notes", label: "Notes" },
      { key: "eliminations", label: "Elims" },
      { key: "turn", label: "Turn" },
      { key: "accusation", label: "Accuse" },
    ],
    []
  );

  const roster = session?.players ?? [];
  const sortedRoster = [...roster].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const leadPlayerId = sortedRoster[0]?.id;
  const playerId = player?.id;
  const isLead = playerId ? leadPlayerId === playerId : false;
  const isActive = session?.session.status === "active";
  const currentTurnSuspectId = session?.session.currentTurnSuspectId || null;
  const isPlayersTurn = isActive && Boolean(player?.suspectId) && currentTurnSuspectId === player?.suspectId;
  const isSetupPhase = isActive && currentTurnSuspectId === null;
  const currentTurnName = currentTurnSuspectId
    ? sortedRoster.find((entry) => entry.suspectId === currentTurnSuspectId)?.suspectName
    : null;


  if (!player) {
    return (
      <div className="phone-shell">
        <div className="phone-card phone-stack">
          <div>Reconnecting to session {code}...</div>
          {actionStatus && <div className="phone-subtitle">{actionStatus}</div>}
          <button
            type="button"
            className="phone-button secondary"
            onClick={() => onNavigate("/phone")}
          >
            Back to Join
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="phone-shell">
      <div className="phone-header">
        <h1>Detective Notebook</h1>
        <div className="phone-subtitle">
          {player.name} · {player.suspectName} · Code {session?.session.code}
        </div>
        {isActive && !isSetupPhase && currentTurnSuspectId && (
          <div className="phone-turn-indicator-wrap">
            <div className="phone-turn-indicator">
              Turn:
              <strong>{isPlayersTurn ? "You" : currentTurnName || currentTurnSuspectId}</strong>
            </div>
          </div>
        )}
        {saving && <div className="phone-subtitle">Saving notes...</div>}
      </div>

      {!isActive && (
        <div className="phone-stack">
          {isLead ? (
            <div className="phone-card phone-stack">
              <div className="phone-section-title">Start the Investigation</div>
              <div className="phone-field">
                <label htmlFor="theme">Theme</label>
                <select
                  id="theme"
                  className="phone-input"
                  value={themeId}
                  onChange={(event) => setThemeId(event.target.value)}
                >
                  <option value="">Random Theme</option>
                  {THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                      {theme.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="phone-field">
                <label htmlFor="difficulty">Difficulty</label>
                <select
                  id="difficulty"
                  className="phone-input"
                  value={difficulty}
                  onChange={(event) => setDifficulty(event.target.value)}
                >
                  {DIFFICULTIES.map((level) => (
                    <option key={level.id} value={level.id}>
                      {level.name}
                    </option>
                  ))}
                </select>
              </div>
              <button type="button" className="phone-button" onClick={startGame}>
                Start Game
              </button>
            </div>
          ) : (
            <div className="phone-card">
              <div className="phone-wait">Waiting for the lead detective to start.</div>
            </div>
          )}

          <div className="phone-card phone-stack">
            <div className="phone-section-title">Detectives</div>
            <div className="phone-roster">
              {sortedRoster.map((entry) => (
                <div key={entry.id} className="phone-roster-item">
                  <span>{entry.name}</span>
                  {entry.id === leadPlayerId ? (
                    <span className="phone-roster-lead">
                      <span className="phone-roster-lead-name">{entry.suspectName}</span>
                      {" · Lead"}
                    </span>
                  ) : (
                    <span>{entry.suspectName}</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {actionStatus && (
            <div className="phone-card">
              <div className="phone-subtitle">{actionStatus}</div>
            </div>
          )}
        </div>
      )}

      {isActive && (
        <>
          {isSetupPhase && (
            <div className="phone-card">
              {isLead ? (
                <div className="phone-stack">
                  <div className="phone-section-title">Setup Complete?</div>
                  <div className="phone-wait">
                    When everyone is ready, begin the investigation.
                  </div>
                  <button
                    type="button"
                    className="phone-button"
                    onClick={() => sendAction("begin_investigation")}
                  >
                    Begin Investigation
                  </button>
                </div>
              ) : (
                <div className="phone-wait">Waiting for the lead detective to begin.</div>
              )}
            </div>
          )}
          {!isSetupPhase && (
            <div className="phone-tabs">
              {tabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`phone-tab ${tab === item.key ? "active" : ""}`}
                  onClick={() => setTab(item.key as PhoneTab)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {!isSetupPhase && (
            <div className="phone-stack">
            {tab === "notes" && (
              <div className="phone-card phone-stack">
                <div className="phone-section-title">Personal Notes</div>
                <textarea
                  className="phone-input"
                  style={{ minHeight: "220px" }}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Jot down your suspicions..."
                />
              </div>
            )}

            {tab === "eliminations" && (
              <div className="phone-card phone-stack">
                <div className="phone-section-title">Suspects</div>
                <div className="phone-stack">
                  {SUSPECTS.map((suspect) => (
                    <label key={suspect.id} className="phone-checkbox">
                      <input
                        type="checkbox"
                        checked={eliminations.suspects.includes(suspect.id)}
                        onChange={() => toggleElimination("suspects", suspect.id)}
                      />
                      {suspect.name}
                    </label>
                  ))}
                </div>

                <div className="phone-section-title">Items</div>
                <div className="phone-stack">
                  {ITEMS.map((item) => (
                    <label key={item.id} className="phone-checkbox">
                      <input
                        type="checkbox"
                        checked={eliminations.items.includes(item.id)}
                        onChange={() => toggleElimination("items", item.id)}
                      />
                      {item.nameUS}
                    </label>
                  ))}
                </div>

                <div className="phone-section-title">Locations</div>
                <div className="phone-stack">
                  {LOCATIONS.map((location) => (
                    <label key={location.id} className="phone-checkbox">
                      <input
                        type="checkbox"
                        checked={eliminations.locations.includes(location.id)}
                        onChange={() => toggleElimination("locations", location.id)}
                      />
                      {location.name}
                    </label>
                  ))}
                </div>

                <div className="phone-section-title">Times</div>
                <div className="phone-stack">
                  {TIMES.map((time) => (
                    <label key={time.id} className="phone-checkbox">
                      <input
                        type="checkbox"
                        checked={eliminations.times.includes(time.id)}
                        onChange={() => toggleElimination("times", time.id)}
                      />
                      {time.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {tab === "turn" && (
              <div className="phone-card phone-stack">
                <div className="phone-section-title">Choose Your Action</div>
                <div className="phone-actions">
                  <button
                    type="button"
                    className="phone-button"
                    onClick={() => sendAction("reveal_clue")}
                    disabled={!isPlayersTurn}
                  >
                    Reveal Next Clue
                  </button>
                  <button
                    type="button"
                    className="phone-button"
                    onClick={() => {
                      setTab("accusation");
                    }}
                    disabled={!isPlayersTurn}
                  >
                    Make Accusation
                  </button>
                  <button
                    type="button"
                    className="phone-button"
                    onClick={() => sendAction("use_secret_passage")}
                    disabled={!isPlayersTurn}
                  >
                    Use Secret Passage
                  </button>
                  <button
                    type="button"
                    className="phone-button"
                    onClick={() => sendAction("read_inspector_note")}
                    disabled={!isPlayersTurn}
                  >
                    Read Inspector Note
                  </button>
                  <button
                    type="button"
                    className="phone-button"
                    onClick={() => sendAction("show_story")}
                    disabled={!isPlayersTurn}
                  >
                    Toggle Story Panel
                  </button>
                  <button
                    type="button"
                    className="phone-button"
                    onClick={() => sendAction("make_suggestion")}
                    disabled={!isPlayersTurn}
                  >
                    Make Suggestion
                  </button>
                </div>
              </div>
            )}

            {tab === "accusation" && (
              <div className="phone-card phone-stack">
                <div className="phone-section-title">Make an Accusation</div>
                <div className="phone-stack">
                  <div>
                    <div className="phone-section-title">WHO</div>
                    <div className="phone-grid phone-grid-suspects">
                      {SUSPECTS.map((suspect) => (
                        <button
                          key={suspect.id}
                          type="button"
                          className={`phone-option phone-option-suspect ${accusation.suspectId === suspect.id ? "selected" : ""}`}
                          onClick={() =>
                            setAccusation((prev) => ({ ...prev, suspectId: suspect.id }))
                          }
                        >
                          <img src={suspectImageById[suspect.id]} alt={suspect.name} />
                          {null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="phone-section-title">WHAT</div>
                    <div className="phone-grid phone-grid-accuse">
                      {ITEMS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`phone-option phone-option-portrait ${accusation.itemId === item.id ? "selected" : ""}`}
                          onClick={() =>
                            setAccusation((prev) => ({ ...prev, itemId: item.id }))
                          }
                        >
                          <img src={itemImageById[item.id]} alt={item.nameUS} />
                          {null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="phone-section-title">WHERE</div>
                    <div className="phone-grid phone-grid-accuse">
                      {LOCATIONS.map((location) => (
                        <button
                          key={location.id}
                          type="button"
                          className={`phone-option phone-option-portrait ${accusation.locationId === location.id ? "selected" : ""}`}
                          onClick={() =>
                            setAccusation((prev) => ({ ...prev, locationId: location.id }))
                          }
                        >
                          <img src={locationImageById[location.id]} alt={location.name} />
                          {null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="phone-section-title">WHEN</div>
                    <div className="phone-grid phone-grid-accuse">
                      {TIMES.map((time) => (
                        <button
                          key={time.id}
                          type="button"
                          className={`phone-option phone-option-portrait ${accusation.timeId === time.id ? "selected" : ""}`}
                          onClick={() =>
                            setAccusation((prev) => ({ ...prev, timeId: time.id }))
                          }
                        >
                          <img src={timeImageById[time.id]} alt={time.name} />
                          {null}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button type="button" className="phone-button" onClick={submitAccusation} disabled={!isPlayersTurn}>
                    Submit to Host
                  </button>
                </div>
              </div>
            )}

            {actionStatus && (
              null
            )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
