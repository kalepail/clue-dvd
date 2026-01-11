import { useEffect, useMemo, useRef, useState } from "react";
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

type AccusationMessageHistory = {
  zero: string[];
  one: string[];
  two: string[];
  three: string[];
};

const defaultMessageHistory: AccusationMessageHistory = {
  zero: [],
  one: [],
  two: [],
  three: [],
};

function buildAccusationMessageKey(code: string, playerId: string): string {
  return `clue-phone-accusation-msgs:${code}:${playerId}`;
}

function loadAccusationMessageHistory(code: string, playerId: string): AccusationMessageHistory {
  try {
    const raw = localStorage.getItem(buildAccusationMessageKey(code, playerId));
    if (!raw) {
      return { ...defaultMessageHistory };
    }
    const parsed = JSON.parse(raw) as AccusationMessageHistory;
    return {
      zero: Array.isArray(parsed.zero) ? parsed.zero : [],
      one: Array.isArray(parsed.one) ? parsed.one : [],
      two: Array.isArray(parsed.two) ? parsed.two : [],
      three: Array.isArray(parsed.three) ? parsed.three : [],
    };
  } catch {
    return { ...defaultMessageHistory };
  }
}

function storeAccusationMessageHistory(code: string, playerId: string, history: AccusationMessageHistory): void {
  try {
    localStorage.setItem(buildAccusationMessageKey(code, playerId), JSON.stringify(history));
  } catch (error) {
    console.error("Failed to store accusation messages:", error);
  }
}

function clearAccusationMessageHistory(code: string, playerId: string): void {
  localStorage.removeItem(buildAccusationMessageKey(code, playerId));
}

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
  const [showAccusationNotice, setShowAccusationNotice] = useState(false);
  const [showActionContinue, setShowActionContinue] = useState(false);
  const [actionContinueMessage, setActionContinueMessage] = useState<string | null>(null);
  const [pendingRevealConfirm, setPendingRevealConfirm] = useState(false);
  const [pendingSuggestionConfirm, setPendingSuggestionConfirm] = useState(false);
  const [accusationFeedback, setAccusationFeedback] = useState<{
    correct: boolean;
    correctCount: number;
  } | null>(null);
  const lastAccusationSeenRef = useRef<string | null>(null);
  const [zeroAccusationMessage, setZeroAccusationMessage] = useState<string | null>(null);
  const [oneAccusationMessage, setOneAccusationMessage] = useState<string | null>(null);
  const [twoAccusationMessage, setTwoAccusationMessage] = useState<string | null>(null);
  const [threeAccusationMessage, setThreeAccusationMessage] = useState<string | null>(null);
  const accusationMessageHistoryRef = useRef<AccusationMessageHistory | null>(null);
  const [themeId, setThemeId] = useState("");
  const [difficulty, setDifficulty] = useState("intermediate");
  const suspectColorMap: Record<string, string> = {
    S01: "#da3f55",
    S02: "#dbad38",
    S03: "#e5e0da",
    S04: "#6c9376",
    S05: "#54539b",
    S06: "#6f4a9b",
    S07: "#49aca7",
    S08: "#78abd8",
    S09: "#b25593",
    S10: "#d9673b",
  };
  const accentColor = player?.suspectId ? suspectColorMap[player.suspectId] : "#b68b2d";
  const accentRgb = useMemo(() => {
    const hex = accentColor.replace("#", "");
    const normalized = hex.length === 3
      ? hex.split("").map((char) => char + char).join("")
      : hex;
    const value = parseInt(normalized, 16);
    if (Number.isNaN(value)) {
      return "182, 139, 45";
    }
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return `${r}, ${g}, ${b}`;
  }, [accentColor]);
  const accentTileStyle = useMemo(
    () => ({
      borderColor: `rgba(${accentRgb}, 0.55)`,
      background: `linear-gradient(140deg, rgba(${accentRgb}, 0.38), rgba(12, 16, 24, 0.92))`,
    }),
    [accentRgb]
  );

  const pickAccusationMessage = (bucket: keyof AccusationMessageHistory, options: string[]) => {
    if (!player) {
      return options[Math.floor(Math.random() * options.length)];
    }
    const history =
      accusationMessageHistoryRef.current ?? loadAccusationMessageHistory(code, player.id);
    accusationMessageHistoryRef.current = history;
    const used = new Set(history[bucket]);
    const available = options.filter((option) => !used.has(option));
    const pool = available.length ? available : options;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    history[bucket] = [...history[bucket], choice];
    storeAccusationMessageHistory(code, player.id, history);
    return choice;
  };

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
    accusationMessageHistoryRef.current = loadAccusationMessageHistory(code, player.id);
  }, [code, player]);

  useEffect(() => {
    if (!player) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await getSession(code);
        if (data.session.status === "closed") {
          clearAccusationMessageHistory(code, player.id);
          clearStoredPlayer(code);
          onNavigate("/phone");
          return;
        }
        setSession(data);
        const refreshedPlayer = data.players.find((entry) => entry.id === player.id);
        if (refreshedPlayer?.lastAccusationResult?.updatedAt) {
          const lastSeen = lastAccusationSeenRef.current;
          const nextSeen = refreshedPlayer.lastAccusationResult.updatedAt;
          if (lastSeen !== nextSeen) {
            lastAccusationSeenRef.current = nextSeen;
            const nextFeedback = {
              correct: refreshedPlayer.lastAccusationResult.correct,
              correctCount: refreshedPlayer.lastAccusationResult.correctCount,
            };
            setAccusationFeedback(nextFeedback);
            if (!nextFeedback.correct && nextFeedback.correctCount === 0) {
              const options = [
                "Maybe pay closer attention...",
                "Perhaps try a little harder...",
                "You didn't just miss -- you dodged every correct answer...",
                "Bold strategy. Wildly incorrect, but bold...",
                "You were wrong with confidence, and honestly, I respect that...",
                "On the bright side, there is nowhere to go but up...",
              ];
              setZeroAccusationMessage(pickAccusationMessage("zero", options));
              setOneAccusationMessage(null);
              setTwoAccusationMessage(null);
              setThreeAccusationMessage(null);
            } else if (!nextFeedback.correct && nextFeedback.correctCount === 1) {
              const options = [
                "You're on the right trail... just not the right forest...",
                "You're asking the right kind of questions. The answers... not so much...",
                "You're in the right headspace, but not at the right answer...",
                "That's a start -- one piece of the puzzle is in place...",
                "You're warming up. Still cold, but warmer...",
                "One of those is actually right. Build on that...",
              ];
              setOneAccusationMessage(pickAccusationMessage("one", options));
              setZeroAccusationMessage(null);
              setTwoAccusationMessage(null);
              setThreeAccusationMessage(null);
            } else if (!nextFeedback.correct && nextFeedback.correctCount === 2) {
              const options = [
                "Now we're getting somewhere...",
                "You've got a real read on this -- just not the whole picture yet...",
                "You're missing only pieces, not the plot...",
                "You're close enough to be dangerous...",
                "You're not far off now...",
              ];
              setTwoAccusationMessage(pickAccusationMessage("two", options));
              setZeroAccusationMessage(null);
              setOneAccusationMessage(null);
              setThreeAccusationMessage(null);
            } else if (!nextFeedback.correct && nextFeedback.correctCount === 3) {
              const options = [
                "You almost had it...",
                "That's agonizingly close...",
                "You're staring right at the answer...",
                "One detail is holding you back...",
                "The culprit just broke a sweat...",
                "You're one step away...",
              ];
              setThreeAccusationMessage(pickAccusationMessage("three", options));
              setZeroAccusationMessage(null);
              setOneAccusationMessage(null);
              setTwoAccusationMessage(null);
            } else {
              setZeroAccusationMessage(null);
              setOneAccusationMessage(null);
              setTwoAccusationMessage(null);
              setThreeAccusationMessage(null);
            }
            setShowAccusationNotice(true);
          }
        }
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
      setActionStatus(null);
      if (action === "use_secret_passage") {
        setActionContinueMessage("Secret passage resolved on the host screen.");
        setShowActionContinue(true);
      } else if (action === "make_suggestion") {
        setActionContinueMessage("Make your suggestion. Continue when the table resolves it.");
        setShowActionContinue(true);
      }
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
      setActionStatus(null);
      setAccusation({ suspectId: "", itemId: "", locationId: "", timeId: "" });
      setTab("turn");
      setShowAccusationNotice(true);
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Failed to submit accusation.");
    }
  };

  const handleContinueInvestigation = async () => {
    if (!player || !token) return;
    try {
      await sendPlayerAction(player.id, token, "turn_action", { action: "continue_investigation" });
    } catch {
      // Ignore failures; host can still continue manually.
    } finally {
      setZeroAccusationMessage(null);
      setOneAccusationMessage(null);
      setTwoAccusationMessage(null);
      setThreeAccusationMessage(null);
      setAccusationFeedback(null);
      setShowAccusationNotice(false);
      setShowActionContinue(false);
      setActionContinueMessage(null);
    }
  };

  const requestRevealClue = () => {
    if (!isPlayersTurn) return;
    setPendingRevealConfirm(true);
  };

  const confirmRevealClue = async () => {
    if (!player || !token) return;
    setPendingRevealConfirm(false);
    await sendAction("reveal_clue");
  };

  const requestSuggestionConfirm = () => {
    if (!isPlayersTurn) return;
    setPendingSuggestionConfirm(true);
  };

  const confirmSuggestion = async () => {
    if (!player || !token) return;
    setPendingSuggestionConfirm(false);
    await sendAction("make_suggestion");
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
      <div
        className="phone-shell"
        style={{
          ["--phone-accent" as never]: accentColor,
          ["--phone-accent-rgb" as never]: accentRgb,
        }}
      >
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
    <div
      className="phone-shell"
      style={{
        ["--phone-accent" as never]: accentColor,
        ["--phone-accent-rgb" as never]: accentRgb,
      }}
    >
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
                <div className="phone-action-grid">
                  <button
                    type="button"
                    className="phone-action-tile"
                    onClick={requestRevealClue}
                    disabled={!isPlayersTurn}
                    style={accentTileStyle}
                  >
                    <div className="phone-action-title">Reveal Next Clue</div>
                    <div className="phone-action-subtitle">Advance the investigation.</div>
                  </button>
                  <button
                    type="button"
                    className="phone-action-tile"
                    onClick={requestSuggestionConfirm}
                    disabled={!isPlayersTurn}
                    style={accentTileStyle}
                  >
                    <div className="phone-action-title">Make Suggestion</div>
                    <div className="phone-action-subtitle">Talk it out with the table.</div>
                  </button>
                  <button
                    type="button"
                    className="phone-action-tile"
                    onClick={() => sendAction("read_inspector_note")}
                    disabled={!isPlayersTurn}
                    style={accentTileStyle}
                  >
                    <div className="phone-action-title">Read Inspector Note</div>
                    <div className="phone-action-subtitle">Choose a confidential note.</div>
                  </button>
                  <button
                    type="button"
                    className="phone-action-tile"
                    onClick={() => sendAction("use_secret_passage")}
                    disabled={!isPlayersTurn}
                    style={accentTileStyle}
                  >
                    <div className="phone-action-title">Use Secret Passage</div>
                    <div className="phone-action-subtitle">Risk it for a shortcut.</div>
                  </button>
                  <button
                    type="button"
                    className="phone-action-tile phone-action-tile-wide phone-action-tile-accuse"
                    onClick={() => {
                      setTab("accusation");
                    }}
                    disabled={!isPlayersTurn}
                  >
                    <div className="phone-action-title">Make Accusation</div>
                    <div className="phone-action-subtitle">Lock in your final guess.</div>
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

      {pendingRevealConfirm && (
        <div className="phone-scrim">
          <div className="phone-scrim-card phone-scrim-card-stack">
            <div>Reveal the next clue?</div>
            <div className="phone-button-row">
              <button type="button" className="phone-button ghost" onClick={() => setPendingRevealConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="phone-button" onClick={confirmRevealClue}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingSuggestionConfirm && (
        <div className="phone-scrim">
          <div className="phone-scrim-card phone-scrim-card-stack">
            <div>Make a suggestion?</div>
            <div className="phone-button-row">
              <button type="button" className="phone-button ghost" onClick={() => setPendingSuggestionConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="phone-button" onClick={confirmSuggestion}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {(showAccusationNotice || showActionContinue) && (
        <div className="phone-scrim">
          <div className="phone-scrim-card phone-scrim-card-stack">
            <div>
              {showAccusationNotice
                ? (accusationFeedback
                    ? accusationFeedback.correct
                      ? "Correct!"
                      : accusationFeedback.correctCount === 0
                        ? zeroAccusationMessage || "So close."
                        : accusationFeedback.correctCount === 1
                          ? oneAccusationMessage || "So close."
                          : accusationFeedback.correctCount === 2
                            ? twoAccusationMessage || "So close."
                            : accusationFeedback.correctCount === 3
                              ? threeAccusationMessage || "So close."
                              : "So close."
                    : "Accusation Submitted")
                : actionContinueMessage || "Action sent to the host."}
            </div>
            {showAccusationNotice && accusationFeedback && !accusationFeedback.correct && (
              <div className="phone-subtitle">
                {accusationFeedback.correctCount}/4 correct
              </div>
            )}
            <button type="button" className="phone-button" onClick={handleContinueInvestigation}>
              Continue Investigation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
