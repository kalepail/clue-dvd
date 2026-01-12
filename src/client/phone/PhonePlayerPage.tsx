import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type DeductionCellProps = {
  rowKey: string;
  playerId: string;
  value: string;
  selectedMark: string;
  onUpdate: (rowKey: string, playerId: string, quadrant?: "tl" | "tr" | "bl" | "br") => void;
};

const DeductionCell = memo(function DeductionCell({
  rowKey,
  playerId,
  value,
  selectedMark,
  onUpdate,
}: DeductionCellProps) {
  const isDot = value.startsWith("dot:");
  const dotList = isDot ? value.replace("dot:", "").split(",").filter(Boolean) : [];
  return (
    <button
      type="button"
      className={`phone-deduction-cell phone-deduction-cell-button ${value ? "marked" : ""}`}
      onPointerDown={() => onUpdate(rowKey, playerId)}
    >
      {isDot ? (
        dotList.map((dot) => (
          <span key={dot} className={`phone-deduction-dot phone-deduction-dot-${dot}`} />
        ))
      ) : (
        value
      )}
      {selectedMark === "dot" && (
        <span className="phone-deduction-quad">
          {(["tl", "tr", "bl", "br"] as const).map((quad) => (
            <button
              key={quad}
              type="button"
              className="phone-deduction-quad-btn"
              onPointerDown={(event) => {
                event.stopPropagation();
                onUpdate(rowKey, playerId, quad);
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
});

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

type DeductionHistoryEntry =
  | { type: "mark"; rowKey: string; playerId: string; previous: string; next: string }
  | { type: "row"; rowKey: string; prevEliminated: boolean; nextEliminated: boolean; prevFinal: boolean; nextFinal: boolean };

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
  const [deductionMarks, setDeductionMarks] = useState<Record<string, Record<string, string>>>({});
  const [selectedMark, setSelectedMark] = useState("X");
  const [deductionHistory, setDeductionHistory] = useState<DeductionHistoryEntry[]>([]);
  const deductionMarksRef = useRef<Record<string, Record<string, string>>>({});
  const deductionHistoryRef = useRef<DeductionHistoryEntry[]>([]);
  const [finalSelections, setFinalSelections] = useState<Record<string, boolean>>({});
  const [recentlyUncircled, setRecentlyUncircled] = useState<string | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const uncircleTimeoutRef = useRef<number | null>(null);
  const suppressEliminationRef = useRef(false);
  const [accusationStep, setAccusationStep] = useState<"suspect" | "item" | "location" | "time">("suspect");
  const [showAccusationNotice, setShowAccusationNotice] = useState(false);
  const [showActionContinue, setShowActionContinue] = useState(false);
  const [actionContinueMessage, setActionContinueMessage] = useState<string | null>(null);
  const [pendingRevealConfirm, setPendingRevealConfirm] = useState(false);
  const [pendingSuggestionConfirm, setPendingSuggestionConfirm] = useState(false);
  const [interruptionConfirming, setInterruptionConfirming] = useState(false);
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
  const [secretPassageUsedThisTurn, setSecretPassageUsedThisTurn] = useState(false);
  const lastTurnRef = useRef<string | null>(null);
  const [selectedInspectorNote, setSelectedInspectorNote] = useState<string | null>(null);
  const [pendingInspectorNote, setPendingInspectorNote] = useState<string | null>(null);
  const [showInspectorNotes, setShowInspectorNotes] = useState(false);
  const suspectColorMap: Record<string, string> = {
    S01: "#da3f55",
    S02: "#dbad38",
    S03: "#e5e0da",
    S04: "#6c9b66",
    S05: "#54539b",
    S06: "#7A29A3",
    S07: "#49aca7",
    S08: "#78abd8",
    S09: "#CB94F7",
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
    const storageKey = `clue-phone-deduction:${code}:${player.id}`;
    const loaded = loadDeductionMarks(storageKey);
    deductionMarksRef.current = loaded;
    setDeductionMarks(loaded);
  }, [code, player]);

  useEffect(() => {
    if (!player) return;
    const storageKey = `clue-phone-deduction:${code}:${player.id}`;
    saveDeductionMarks(storageKey, deductionMarks);
  }, [code, deductionMarks, player]);

  useEffect(() => {
    deductionMarksRef.current = deductionMarks;
  }, [deductionMarks]);

  const loadFinalSelections = (storageKey: string) => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, boolean>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const saveFinalSelections = (storageKey: string, next: Record<string, boolean>) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage errors.
    }
  };

  useEffect(() => {
    if (!player) return;
    const storageKey = `clue-phone-final:${code}:${player.id}`;
    setFinalSelections(loadFinalSelections(storageKey));
  }, [code, player]);

  useEffect(() => {
    if (!player) return;
    const storageKey = `clue-phone-final:${code}:${player.id}`;
    saveFinalSelections(storageKey, finalSelections);
  }, [code, finalSelections, player]);

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
        if (refreshedPlayer) {
          setPlayer((prev) =>
            prev
              ? {
                  ...prev,
                  inspectorNotes: refreshedPlayer.inspectorNotes ?? prev.inspectorNotes,
                  inspectorNoteTexts: refreshedPlayer.inspectorNoteTexts ?? prev.inspectorNoteTexts,
                  lastAccusationResult: refreshedPlayer.lastAccusationResult ?? prev.lastAccusationResult,
                }
              : refreshedPlayer
          );
        }
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
        setSecretPassageUsedThisTurn(true);
        setActionContinueMessage("Secret passage resolved on the host screen.");
        setShowActionContinue(true);
      } else if (action === "reveal_clue") {
        setActionContinueMessage("Clue revealed on the host screen.");
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

  const updateDeductionMark = useCallback(
    (rowKey: string, playerIdValue: string, quadrant?: "tl" | "tr" | "bl" | "br") => {
      const currentMarks = deductionMarksRef.current;
      const row = currentMarks[rowKey] ?? {};
      const current = row[playerIdValue] ?? "";
      let nextValue = selectedMark === "dot" ? current : (current === selectedMark ? "" : selectedMark);
      if (selectedMark === "dot") {
        const currentDots = current.startsWith("dot:")
          ? current.replace("dot:", "").split(",").filter(Boolean)
          : [];
        const hasDot = quadrant ? currentDots.includes(quadrant) : false;
        const nextDots = quadrant
          ? (hasDot ? currentDots.filter((value) => value !== quadrant) : [...currentDots, quadrant])
          : currentDots;
        nextValue = nextDots.length ? `dot:${nextDots.join(",")}` : "";
      }
      if (nextValue === current) return;
      const entry: DeductionHistoryEntry = {
        type: "mark",
        rowKey,
        playerId: playerIdValue,
        previous: current,
        next: nextValue,
      };
      const nextHistory = [entry, ...deductionHistoryRef.current].slice(0, 80);
      deductionHistoryRef.current = nextHistory;
      setDeductionHistory(nextHistory);
      const nextRow = { ...row, [playerIdValue]: nextValue };
      const nextMarks = { ...currentMarks, [rowKey]: nextRow };
      deductionMarksRef.current = nextMarks;
      setDeductionMarks(nextMarks);
    },
    [selectedMark],
  );

  const handleUndoDeduction = () => {
    const currentHistory = deductionHistoryRef.current;
    if (currentHistory.length === 0) return;
    const [latest, ...rest] = currentHistory;
    deductionHistoryRef.current = rest;
    setDeductionHistory(rest);
    if (latest.type === "mark") {
      const currentMarks = deductionMarksRef.current;
      const row = currentMarks[latest.rowKey] ?? {};
      const nextRow = { ...row, [latest.playerId]: latest.previous };
      const nextMarks = { ...currentMarks, [latest.rowKey]: nextRow };
      deductionMarksRef.current = nextMarks;
      setDeductionMarks(nextMarks);
      return;
    }
    const [category, id] = latest.rowKey.split(":");
    if (category && id) {
      setEliminations((prev) => {
        const list = prev[category as keyof EliminationState];
        if (!Array.isArray(list)) return prev;
        const hasId = list.includes(id);
        if (latest.prevEliminated && !hasId) {
          return { ...prev, [category]: [...list, id] };
        }
        if (!latest.prevEliminated && hasId) {
          return { ...prev, [category]: list.filter((value) => value !== id) };
        }
        return prev;
      });
    }
    setFinalSelections((prev) => ({ ...prev, [latest.rowKey]: latest.prevFinal }));
  };


  const handleRowPressStart = (rowKey: string) => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    longPressTimeoutRef.current = window.setTimeout(() => {
      const prevFinal = Boolean(finalSelections[rowKey]);
      const nextFinal = !prevFinal;
      const [category, id] = rowKey.split(":");
      const prevEliminated =
        category && id
          ? eliminations[category as keyof EliminationState]?.includes(id)
          : false;
      const nextEliminated = nextFinal ? false : prevEliminated;
      const entry: DeductionHistoryEntry = {
        type: "row",
        rowKey,
        prevEliminated,
        nextEliminated,
        prevFinal,
        nextFinal,
      };
      const nextHistory = [entry, ...deductionHistoryRef.current].slice(0, 80);
      deductionHistoryRef.current = nextHistory;
      setDeductionHistory(nextHistory);
      setFinalSelections((prev) => ({ ...prev, [rowKey]: nextFinal }));
      if (!nextFinal) {
        setRecentlyUncircled(rowKey);
        if (uncircleTimeoutRef.current) {
          window.clearTimeout(uncircleTimeoutRef.current);
        }
        uncircleTimeoutRef.current = window.setTimeout(() => {
          setRecentlyUncircled(null);
        }, 500);
      }
      if (category && id && prevEliminated) {
        setEliminations((prev) => {
          const list = prev[category as keyof EliminationState];
          if (!Array.isArray(list)) return prev;
          const nextList = list.filter((value) => value !== id);
          return { ...prev, [category]: nextList };
        });
      }
      suppressEliminationRef.current = true;
    }, 450);
  };

  const handleRowPressEnd = () => {
    if (longPressTimeoutRef.current) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const handleRowClick = (category: keyof EliminationState, id: string) => {
    if (suppressEliminationRef.current) {
      suppressEliminationRef.current = false;
      return;
    }
    const rowKey = `${category}:${id}`;
    const prevFinal = Boolean(finalSelections[rowKey]);
    const prevEliminated = eliminations[category].includes(id);
    const nextEliminated = !prevEliminated;
    const nextFinal = prevFinal ? false : prevFinal;
    const entry: DeductionHistoryEntry = {
      type: "row",
      rowKey,
      prevEliminated,
      nextEliminated,
      prevFinal,
      nextFinal,
    };
    const nextHistory = [entry, ...deductionHistoryRef.current].slice(0, 80);
    deductionHistoryRef.current = nextHistory;
    setDeductionHistory(nextHistory);
    if (prevFinal) {
      setFinalSelections((prev) => {
        const next = { ...prev };
        delete next[rowKey];
        return next;
      });
      setRecentlyUncircled(rowKey);
      if (uncircleTimeoutRef.current) {
        window.clearTimeout(uncircleTimeoutRef.current);
      }
      uncircleTimeoutRef.current = window.setTimeout(() => {
        setRecentlyUncircled(null);
      }, 500);
    }
    toggleElimination(category, id);
  };

  const hasFinalSelection = (prefix: string) =>
    Object.keys(finalSelections).some((key) => key.startsWith(prefix) && finalSelections[key]);

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

  const confirmInterruption = async () => {
    if (!player || !token) return;
    setInterruptionConfirming(true);
    try {
      await sendPlayerAction(player.id, token, "turn_action", { action: "acknowledge_interruption" });
    } finally {
      setInterruptionConfirming(false);
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
      { key: "eliminations", label: "Deductions" },
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
  const deductionPlayers = sortedRoster.filter((entry) => entry.id !== playerId);
  const isLead = playerId ? leadPlayerId === playerId : false;
  const isPlum = player?.suspectId === "S06";
  const plumButtonStyle = isPlum ? { color: "#ffffff" } : undefined;
  const isActive = session?.session.status === "active";
  const currentTurnSuspectId = session?.session.currentTurnSuspectId || null;
  const isPlayersTurn = isActive && Boolean(player?.suspectId) && currentTurnSuspectId === player?.suspectId;
  const isSetupPhase = isActive && currentTurnSuspectId === null;
  const currentTurnName = currentTurnSuspectId
    ? sortedRoster.find((entry) => entry.suspectId === currentTurnSuspectId)?.suspectName
    : null;
  const inspectorNotes = player?.inspectorNotes ?? [];
  const inspectorNoteTexts = player?.inspectorNoteTexts ?? {};
  const note1Available = session?.session.note1Available ?? false;
  const note2Available = session?.session.note2Available ?? false;
  const interruptionActive = session?.session.interruptionActive ?? false;
  const interruptionMessage = session?.session.interruptionMessage ?? "";

  const markOptions = [
    { key: "x", label: "X", symbol: "X" },
    { key: "slash", label: "Slash", symbol: "/" },
    { key: "check", label: "Check", symbol: "✓" },
    { key: "maybe", label: "?", symbol: "?" },
    { key: "dot", label: "Dot", symbol: "dot" },
  ];

  const getPlayerInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "--";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  const loadDeductionMarks = (storageKey: string) => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const saveDeductionMarks = (storageKey: string, next: Record<string, Record<string, string>>) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      // Ignore storage errors.
    }
  };

  useEffect(() => {
    if (lastTurnRef.current !== currentTurnSuspectId) {
      setSecretPassageUsedThisTurn(false);
      setPendingInspectorNote(null);
      lastTurnRef.current = currentTurnSuspectId;
    }
  }, [currentTurnSuspectId]);

  useEffect(() => {
    if (tab === "accusation") {
      setAccusationStep("suspect");
    }
  }, [tab]);

  const handleInspectorNoteSelect = (noteId: string) => {
    if (inspectorNotes.includes(noteId)) {
      setSelectedInspectorNote(noteId);
      return;
    }
    if (!isPlayersTurn) {
      setActionStatus("You can only read a new inspector note on your turn.");
      return;
    }
    setPendingInspectorNote(noteId);
  };

  const confirmInspectorNote = async () => {
    if (!pendingInspectorNote) return;
    if (!player || !token) return;
    setActionStatus("Requesting inspector note...");
    try {
      await sendPlayerAction(player.id, token, "turn_action", {
        action: "read_inspector_note",
        noteId: pendingInspectorNote,
      });
      setSelectedInspectorNote(pendingInspectorNote);
      setPendingInspectorNote(null);
      setActionStatus("Inspector note sent to your device.");
    } catch (err) {
      setActionStatus(err instanceof Error ? err.message : "Failed to request inspector note.");
    }
  };


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
              <button type="button" className="phone-button" onClick={startGame} style={plumButtonStyle}>
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
                    className="phone-button secondary"
                    onClick={() => sendAction("toggle_setup_symbols")}
                  >
                    Toggle Symbol Reveal
                  </button>
                  <button
                    type="button"
                    className="phone-button"
                    onClick={() => sendAction("begin_investigation")}
                    style={plumButtonStyle}
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
            {showInspectorNotes && (
              <div className="phone-modal-backdrop">
                <div className="phone-modal phone-stack">
                  <div className="phone-section-title">Inspector Notes</div>
                  {(["N1", "N2"] as const).map((noteId) => {
                    const isRead = inspectorNotes.includes(noteId);
                    const available = noteId === "N1" ? note1Available : note2Available;
                    const status = isRead
                      ? "Read"
                      : available
                        ? isPlayersTurn
                          ? "Use Turn"
                          : "Available"
                        : "Unavailable";
                    return (
                      <button
                        key={noteId}
                        type="button"
                        className="phone-button secondary"
                        onClick={() => handleInspectorNoteSelect(noteId)}
                        disabled={!isRead && (!isPlayersTurn || !available)}
                      >
                        {noteId === "N1" ? "Note 1" : "Note 2"} · {status}
                      </button>
                    );
                  })}
                  {pendingInspectorNote && (
                    <button type="button" className="phone-button" onClick={confirmInspectorNote}>
                      Confirm Read {pendingInspectorNote === "N1" ? "Note 1" : "Note 2"}
                    </button>
                  )}
                  {selectedInspectorNote && (
                    <div className="phone-card">
                      <div className="phone-section-title">
                        Inspector Note {selectedInspectorNote === "N1" ? "1" : "2"}
                      </div>
                      {inspectorNoteTexts[selectedInspectorNote] ? (
                        <div className="phone-subtitle">
                          {inspectorNoteTexts[selectedInspectorNote]}
                        </div>
                      ) : (
                        <div className="phone-subtitle">Fetching note...</div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    className="phone-button secondary"
                    onClick={() => {
                      setShowInspectorNotes(false);
                      setSelectedInspectorNote(null);
                      setPendingInspectorNote(null);
                    }}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}

            {tab === "eliminations" && (
              <div className="phone-deduction-sheet">
                <div
                  className="phone-deduction-paper"
                  style={{
                    ["--deduction-cols" as never]: Math.max(deductionPlayers.length, 1),
                  }}
                >
                  <div className="phone-deduction-columns">
                    <div className="phone-deduction-left">
                      <section className="phone-deduction-section">
                        <div className="phone-deduction-title-row">
                          <h3>SUSPECTS</h3>
                          <span className="phone-deduction-hint">Tap - strike through; hold - circle</span>
                        </div>
                        <div className="phone-deduction-table">
                          <div className="phone-deduction-header">
                            <span className="phone-deduction-row-label" />
                            <span className="phone-deduction-cells">
                              {deductionPlayers.map((entry) => (
                                <span key={entry.id} className="phone-deduction-header-cell">
                                  {getPlayerInitials(entry.suspectName || entry.name)}
                                </span>
                              ))}
                            </span>
                          </div>
                          <div className="phone-deduction-group-label">Men</div>
                          {["S02", "S04", "S06", "S08", "S10"].map((id) => {
                            const suspect = SUSPECTS.find((entry) => entry.id === id);
                            if (!suspect) return null;
                            const eliminated = eliminations.suspects.includes(suspect.id);
                            const rowKey = `suspects:${suspect.id}`;
                            const rowMarks = deductionMarks[rowKey] ?? {};
                            return (
                              <div
                                key={suspect.id}
                                className={`phone-deduction-row ${eliminated ? "marked eliminated" : ""} ${finalSelections[rowKey] ? "final" : ""} ${recentlyUncircled === rowKey ? "uncircled" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="phone-deduction-row-label-btn"
                                  onClick={() => handleRowClick("suspects", suspect.id)}
                                  onPointerDown={() => handleRowPressStart(rowKey)}
                                  onPointerUp={handleRowPressEnd}
                                  onPointerLeave={handleRowPressEnd}
                                  onPointerCancel={handleRowPressEnd}
                                  aria-pressed={eliminated}
                                >
                                  {suspect.name}
                                </button>
                                <span className="phone-deduction-cells">
                                  {deductionPlayers.map((entry) => (
                                    <DeductionCell
                                      key={entry.id}
                                      rowKey={rowKey}
                                      playerId={entry.id}
                                      value={rowMarks[entry.id] ?? ""}
                                      selectedMark={selectedMark}
                                      onUpdate={updateDeductionMark}
                                    />
                                  ))}
                                </span>
                              </div>
                            );
                          })}
                          <div className="phone-deduction-divider" />
                          <div className="phone-deduction-group-label">Women</div>
                          {["S01", "S03", "S05", "S07", "S09"].map((id) => {
                            const suspect = SUSPECTS.find((entry) => entry.id === id);
                            if (!suspect) return null;
                            const eliminated = eliminations.suspects.includes(suspect.id);
                            const rowKey = `suspects:${suspect.id}`;
                            const rowMarks = deductionMarks[rowKey] ?? {};
                            return (
                              <div
                                key={suspect.id}
                                className={`phone-deduction-row ${eliminated ? "marked eliminated" : ""} ${finalSelections[rowKey] ? "final" : ""} ${recentlyUncircled === rowKey ? "uncircled" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="phone-deduction-row-label-btn"
                                  onClick={() => handleRowClick("suspects", suspect.id)}
                                  onPointerDown={() => handleRowPressStart(rowKey)}
                                  onPointerUp={handleRowPressEnd}
                                  onPointerLeave={handleRowPressEnd}
                                  onPointerCancel={handleRowPressEnd}
                                  aria-pressed={eliminated}
                                >
                                  {suspect.name}
                                </button>
                                <span className="phone-deduction-cells">
                                  {deductionPlayers.map((entry) => (
                                    <DeductionCell
                                      key={entry.id}
                                      rowKey={rowKey}
                                      playerId={entry.id}
                                      value={rowMarks[entry.id] ?? ""}
                                      selectedMark={selectedMark}
                                      onUpdate={updateDeductionMark}
                                    />
                                  ))}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className="phone-deduction-section">
                        <h3>LOCATIONS</h3>
                        <div className="phone-deduction-table">
                          <div className="phone-deduction-header">
                            <span className="phone-deduction-row-label" />
                            <span className="phone-deduction-cells">
                              {deductionPlayers.map((entry) => (
                                <span key={entry.id} className="phone-deduction-header-cell">
                                  {getPlayerInitials(entry.suspectName || entry.name)}
                                </span>
                              ))}
                            </span>
                          </div>
                          {LOCATIONS.map((location) => {
                            const eliminated = eliminations.locations.includes(location.id);
                            const rowKey = `locations:${location.id}`;
                            const rowMarks = deductionMarks[rowKey] ?? {};
                            return (
                              <div
                                key={location.id}
                                className={`phone-deduction-row ${eliminated ? "marked eliminated" : ""} ${finalSelections[rowKey] ? "final" : ""} ${recentlyUncircled === rowKey ? "uncircled" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="phone-deduction-row-label-btn"
                                  onClick={() => handleRowClick("locations", location.id)}
                                  onPointerDown={() => handleRowPressStart(rowKey)}
                                  onPointerUp={handleRowPressEnd}
                                  onPointerLeave={handleRowPressEnd}
                                  onPointerCancel={handleRowPressEnd}
                                  aria-pressed={eliminated}
                                >
                                  {location.name}
                                </button>
                                <span className="phone-deduction-cells">
                                  {deductionPlayers.map((entry) => (
                                    <DeductionCell
                                      key={entry.id}
                                      rowKey={rowKey}
                                      playerId={entry.id}
                                      value={rowMarks[entry.id] ?? ""}
                                      selectedMark={selectedMark}
                                      onUpdate={updateDeductionMark}
                                    />
                                  ))}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className="phone-deduction-section">
                        <h3>TIME</h3>
                        <div className="phone-deduction-table">
                          <div className="phone-deduction-header">
                            <span className="phone-deduction-row-label" />
                            <span className="phone-deduction-cells">
                              {deductionPlayers.map((entry) => (
                                <span key={entry.id} className="phone-deduction-header-cell">
                                  {getPlayerInitials(entry.suspectName || entry.name)}
                                </span>
                              ))}
                            </span>
                          </div>
                          {TIMES.map((time) => {
                            const eliminated = eliminations.times.includes(time.id);
                            const rowKey = `times:${time.id}`;
                            const rowMarks = deductionMarks[rowKey] ?? {};
                            return (
                              <div
                                key={time.id}
                                className={`phone-deduction-row ${eliminated ? "marked eliminated" : ""} ${finalSelections[rowKey] ? "final" : ""} ${recentlyUncircled === rowKey ? "uncircled" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="phone-deduction-row-label-btn"
                                  onClick={() => handleRowClick("times", time.id)}
                                  onPointerDown={() => handleRowPressStart(rowKey)}
                                  onPointerUp={handleRowPressEnd}
                                  onPointerLeave={handleRowPressEnd}
                                  onPointerCancel={handleRowPressEnd}
                                  aria-pressed={eliminated}
                                >
                                  {time.name}
                                </button>
                                <span className="phone-deduction-cells">
                                  {deductionPlayers.map((entry) => (
                                    <DeductionCell
                                      key={entry.id}
                                      rowKey={rowKey}
                                      playerId={entry.id}
                                      value={rowMarks[entry.id] ?? ""}
                                      selectedMark={selectedMark}
                                      onUpdate={updateDeductionMark}
                                    />
                                  ))}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className="phone-deduction-section">
                        <h3>ITEMS</h3>
                        <div className="phone-deduction-table">
                          <div className="phone-deduction-header">
                            <span className="phone-deduction-row-label" />
                            <span className="phone-deduction-cells">
                              {deductionPlayers.map((entry) => (
                                <span key={entry.id} className="phone-deduction-header-cell">
                                  {getPlayerInitials(entry.suspectName || entry.name)}
                                </span>
                              ))}
                            </span>
                          </div>
                          <div className="phone-deduction-group-label">Antiques</div>
                          {["I01", "I02", "I03"].map((id) => {
                            const item = ITEMS.find((entry) => entry.id === id);
                            if (!item) return null;
                            const eliminated = eliminations.items.includes(item.id);
                            const rowKey = `items:${item.id}`;
                            const rowMarks = deductionMarks[rowKey] ?? {};
                            return (
                              <div
                                key={item.id}
                                className={`phone-deduction-row ${eliminated ? "marked eliminated" : ""} ${finalSelections[rowKey] ? "final" : ""} ${recentlyUncircled === rowKey ? "uncircled" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="phone-deduction-row-label-btn"
                                  onClick={() => handleRowClick("items", item.id)}
                                  onPointerDown={() => handleRowPressStart(rowKey)}
                                  onPointerUp={handleRowPressEnd}
                                  onPointerLeave={handleRowPressEnd}
                                  onPointerCancel={handleRowPressEnd}
                                  aria-pressed={eliminated}
                                >
                                  {item.name}
                                </button>
                                <span className="phone-deduction-cells">
                                  {deductionPlayers.map((entry) => (
                                    <DeductionCell
                                      key={entry.id}
                                      rowKey={rowKey}
                                      playerId={entry.id}
                                      value={rowMarks[entry.id] ?? ""}
                                      selectedMark={selectedMark}
                                      onUpdate={updateDeductionMark}
                                    />
                                  ))}
                                </span>
                              </div>
                            );
                          })}
                          <div className="phone-deduction-divider" />
                          <div className="phone-deduction-group-label">Desk Items</div>
                          {["I05", "I06", "I07", "I08"].map((id) => {
                            const item = ITEMS.find((entry) => entry.id === id);
                            if (!item) return null;
                            const eliminated = eliminations.items.includes(item.id);
                            const rowKey = `items:${item.id}`;
                            const rowMarks = deductionMarks[rowKey] ?? {};
                            return (
                              <div
                                key={item.id}
                                className={`phone-deduction-row ${eliminated ? "marked eliminated" : ""} ${finalSelections[rowKey] ? "final" : ""} ${recentlyUncircled === rowKey ? "uncircled" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="phone-deduction-row-label-btn"
                                  onClick={() => handleRowClick("items", item.id)}
                                  onPointerDown={() => handleRowPressStart(rowKey)}
                                  onPointerUp={handleRowPressEnd}
                                  onPointerLeave={handleRowPressEnd}
                                  onPointerCancel={handleRowPressEnd}
                                  aria-pressed={eliminated}
                                >
                                  {item.name}
                                </button>
                                <span className="phone-deduction-cells">
                                  {deductionPlayers.map((entry) => (
                                    <DeductionCell
                                      key={entry.id}
                                      rowKey={rowKey}
                                      playerId={entry.id}
                                      value={rowMarks[entry.id] ?? ""}
                                      selectedMark={selectedMark}
                                      onUpdate={updateDeductionMark}
                                    />
                                  ))}
                                </span>
                              </div>
                            );
                          })}
                          <div className="phone-deduction-divider" />
                          <div className="phone-deduction-group-label">Jewelry</div>
                          {["I04", "I09", "I10", "I11"].map((id) => {
                            const item = ITEMS.find((entry) => entry.id === id);
                            if (!item) return null;
                            const eliminated = eliminations.items.includes(item.id);
                            const rowKey = `items:${item.id}`;
                            const rowMarks = deductionMarks[rowKey] ?? {};
                            return (
                              <div
                                key={item.id}
                                className={`phone-deduction-row ${eliminated ? "marked eliminated" : ""} ${finalSelections[rowKey] ? "final" : ""} ${recentlyUncircled === rowKey ? "uncircled" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="phone-deduction-row-label-btn"
                                  onClick={() => handleRowClick("items", item.id)}
                                  onPointerDown={() => handleRowPressStart(rowKey)}
                                  onPointerUp={handleRowPressEnd}
                                  onPointerLeave={handleRowPressEnd}
                                  onPointerCancel={handleRowPressEnd}
                                  aria-pressed={eliminated}
                                >
                                  {item.name}
                                </button>
                                <span className="phone-deduction-cells">
                                  {deductionPlayers.map((entry) => (
                                    <DeductionCell
                                      key={entry.id}
                                      rowKey={rowKey}
                                      playerId={entry.id}
                                      value={rowMarks[entry.id] ?? ""}
                                      selectedMark={selectedMark}
                                      onUpdate={updateDeductionMark}
                                    />
                                  ))}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    </div>
                  </div>
                </div>
                <div className="phone-deduction-toolbar">
                  <button
                    type="button"
                    className="phone-deduction-tool"
                    onPointerDown={handleUndoDeduction}
                    disabled={deductionHistory.length === 0}
                  >
                    <span className="phone-deduction-tool-symbol">Undo</span>
                  </button>
                  {markOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`phone-deduction-tool ${selectedMark === option.symbol ? "active" : ""}`}
                      onClick={() => setSelectedMark(option.symbol)}
                    >
                      <span className="phone-deduction-tool-symbol">
                        {option.symbol || "—"}
                      </span>
                    </button>
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
                    onClick={() => setShowInspectorNotes(true)}
                    style={accentTileStyle}
                  >
                    <div className="phone-action-title">Read Inspector Note</div>
                    <div className="phone-action-subtitle">Choose a confidential note.</div>
                  </button>
                  <button
                    type="button"
                    className="phone-action-tile"
                    onClick={() => sendAction("use_secret_passage")}
                    disabled={!isPlayersTurn || secretPassageUsedThisTurn}
                    style={accentTileStyle}
                  >
                    <div className="phone-action-title">Use Secret Passage</div>
                    <div className="phone-action-subtitle">
                      {secretPassageUsedThisTurn ? "Already used this turn." : "Risk it for a shortcut."}
                    </div>
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
                  <div className="phone-accusation-steps">
                    <button
                      type="button"
                      className={`phone-button secondary phone-accusation-step ${accusationStep === "suspect" ? "active" : ""}`}
                      onClick={() => setAccusationStep("suspect")}
                    >
                      Who {accusation.suspectId ? "(Set)" : ""}
                    </button>
                    <button
                      type="button"
                      className={`phone-button secondary phone-accusation-step ${accusationStep === "item" ? "active" : ""}`}
                      onClick={() => setAccusationStep("item")}
                    >
                      What {accusation.itemId ? "(Set)" : ""}
                    </button>
                    <button
                      type="button"
                      className={`phone-button secondary phone-accusation-step ${accusationStep === "location" ? "active" : ""}`}
                      onClick={() => setAccusationStep("location")}
                    >
                      Where {accusation.locationId ? "(Set)" : ""}
                    </button>
                    <button
                      type="button"
                      className={`phone-button secondary phone-accusation-step ${accusationStep === "time" ? "active" : ""}`}
                      onClick={() => setAccusationStep("time")}
                    >
                      When {accusation.timeId ? "(Set)" : ""}
                    </button>
                  </div>

                  {accusationStep === "suspect" && (
                    <div>
                      <div className="phone-section-title">WHO</div>
                      <div className="phone-grid phone-grid-suspects">
                        {SUSPECTS.filter((suspect) => {
                          const hasFinal = hasFinalSelection("suspects:");
                          const isFinal = finalSelections[`suspects:${suspect.id}`];
                          if (hasFinal) return Boolean(isFinal);
                          return !eliminations.suspects.includes(suspect.id);
                        }).map((suspect) => (
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
                  )}

                  {accusationStep === "item" && (
                    <div>
                      <div className="phone-section-title">WHAT</div>
                      <div className="phone-grid phone-grid-accuse">
                        {ITEMS.filter((item) => {
                          const hasFinal = hasFinalSelection("items:");
                          const isFinal = finalSelections[`items:${item.id}`];
                          if (hasFinal) return Boolean(isFinal);
                          return !eliminations.items.includes(item.id);
                        }).map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={`phone-option phone-option-portrait ${accusation.itemId === item.id ? "selected" : ""}`}
                            onClick={() =>
                              setAccusation((prev) => ({ ...prev, itemId: item.id }))
                            }
                          >
                            <img src={itemImageById[item.id]} alt={item.name} />
                            {null}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {accusationStep === "location" && (
                    <div>
                      <div className="phone-section-title">WHERE</div>
                      <div className="phone-grid phone-grid-accuse">
                        {LOCATIONS.filter((location) => {
                          const hasFinal = hasFinalSelection("locations:");
                          const isFinal = finalSelections[`locations:${location.id}`];
                          if (hasFinal) return Boolean(isFinal);
                          return !eliminations.locations.includes(location.id);
                        }).map((location) => (
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
                  )}

                  {accusationStep === "time" && (
                    <div>
                      <div className="phone-section-title">WHEN</div>
                      <div className="phone-grid phone-grid-accuse">
                        {TIMES.filter((time) => {
                          const hasFinal = hasFinalSelection("times:");
                          const isFinal = finalSelections[`times:${time.id}`];
                          if (hasFinal) return Boolean(isFinal);
                          return !eliminations.times.includes(time.id);
                        }).map((time) => (
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
                  )}

                  <button
                    type="button"
                    className="phone-button"
                    onClick={submitAccusation}
                    disabled={!isPlayersTurn}
                    style={plumButtonStyle}
                  >
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
              <button
                type="button"
                className="phone-button ghost"
                onClick={() => setPendingRevealConfirm(false)}
                style={plumButtonStyle}
              >
                Cancel
              </button>
              <button type="button" className="phone-button" onClick={confirmRevealClue} style={plumButtonStyle}>
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
              <button
                type="button"
                className="phone-button ghost"
                onClick={() => setPendingSuggestionConfirm(false)}
                style={plumButtonStyle}
              >
                Cancel
              </button>
              <button type="button" className="phone-button" onClick={confirmSuggestion} style={plumButtonStyle}>
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {isLead && interruptionActive && (
        <div className="phone-scrim">
          <div className="phone-scrim-card phone-scrim-card-stack">
            <div className="phone-section-title">Inspector Interruption</div>
            <div className="phone-subtitle">
              Inspector Brown would like a word...
            </div>
            <button
              type="button"
              className="phone-button"
              onClick={confirmInterruption}
              disabled={interruptionConfirming}
              style={plumButtonStyle}
            >
              {interruptionConfirming ? "Sending..." : "Continue"}
            </button>
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
            <button
              type="button"
              className="phone-button"
              onClick={handleContinueInvestigation}
              style={plumButtonStyle}
            >
              Continue Investigation
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
