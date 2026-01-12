import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Search, Gavel, CheckCircle, Users, Sparkles, Clock, BookOpen, DoorOpen, Bell, MessageCircle } from "lucide-react";
import { gameStore, type GameDataFormatted } from "../hooks/useGameStore";
import ClueDisplay from "../components/ClueDisplay";
import AccusationPanel from "../components/AccusationPanel";
import GameHistory from "../components/GameHistory";
import SolutionCards from "../components/SolutionCards";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/client/components/ui/card";
import { Badge } from "@/client/components/ui/badge";
import { Progress } from "@/client/components/ui/progress";
import { IconStat } from "@/client/components/ui/icon-stat";
import type { EliminationState } from "../../shared/api-types";
import { getLocationName } from "../../shared/game-elements";
import { closeSession, getSession, getSessionEvents, sendAccusationResult, sendInspectorNoteResult, updateInspectorNoteAvailability, updateInterruptionStatus, updateSessionTurn } from "../phone/api";
import { clearHostSessionCode, setHostAutoCreate } from "../phone/storage";
import type { PhoneSessionStatus } from "../../phone/types";

interface Props {
  gameId: string;
  onNavigate: (path: string) => void;
}

const suspectColorById: Record<string, string> = {
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

const solutionImageById: Record<string, string> = {
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
  I01: "/images/items/Spyglass.png",
  I02: "/images/items/Revolver.png",
  I03: "/images/items/Rare_Book.png",
  I04: "/images/items/Medal.png",
  I05: "/images/items/Billfold.png",
  I06: "/images/items/Gold_Pen.png",
  I07: "/images/items/Letter_Opener.png",
  I08: "/images/items/Crystal_Paperweight.png",
  I09: "/images/items/Pocket_watch.png",
  I10: "/images/items/Jade_Hairpin.png",
  I11: "/images/items/Scarab_Broach.png",
  L01: "/images/locations/Hall.png",
  L02: "/images/locations/Lounge.png",
  L03: "/images/locations/Dining Room.png",
  L04: "/images/locations/Kitchen.png",
  L05: "/images/locations/Ballroom.png",
  L06: "/images/locations/Conservatory.png",
  L07: "/images/locations/Billiard_Room.png",
  L08: "/images/locations/Library.png",
  L09: "/images/locations/Study.png",
  L10: "/images/locations/Rose Garden.png",
  L11: "/images/locations/Fountain.png",
  T01: "/images/times/Dawn.png",
  T02: "/images/times/Breakfast.png",
  T03: "/images/times/Late Morning.png",
  T04: "/images/times/Lunch.png",
  T05: "/images/times/Early Afternoon.png",
  T06: "/images/times/Tea_Time.png",
  T07: "/images/times/Dusk.png",
  T08: "/images/times/Dinner.png",
  T09: "/images/times/Night.png",
  T10: "/images/times/Midnight.png",
};

// Empty elimination state for initial player marks
const emptyEliminated: EliminationState = {
  suspects: [],
  items: [],
  locations: [],
  times: [],
};

export default function GamePage({ gameId, onNavigate }: Props) {
  const [game, setGame] = useState<GameDataFormatted | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealingClue, setRevealingClue] = useState(false);
  const [latestClue, setLatestClue] = useState<{
    speaker: string;
    text: string;
    eliminated?: { type: string; ids: string[] };
  } | null>(null);
  const [showClueReveal, setShowClueReveal] = useState(false);
  const [showAccusation, setShowAccusation] = useState(false);
  const [phoneAccusation, setPhoneAccusation] = useState<{
    suspectId: string;
    itemId: string;
    locationId: string;
    timeId: string;
  } | null>(null);
  const [lastPhoneEventId, setLastPhoneEventId] = useState<number | null>(null);
  const [phoneLobbyStatus, setPhoneLobbyStatus] = useState<PhoneSessionStatus | "missing" | null>(null);
  const [showNarrative, setShowNarrative] = useState(false);
  const [secretPassageResult, setSecretPassageResult] = useState<{
    outcome: "good" | "neutral" | "bad";
    description: string;
  } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showInterruption, setShowInterruption] = useState(false);
  const [showInterruptionIntro, setShowInterruptionIntro] = useState(false);
  const [interruptionMessage, setInterruptionMessage] = useState("");
  const [interruptionType, setInterruptionType] = useState<"turn_in_card" | "unlock_rooms" | "inspector_note">("turn_in_card");
  const [inspectorImageIndex, setInspectorImageIndex] = useState(0);
  const pauseStartRef = useRef<number | null>(null);
  const pauseAccumulatedRef = useRef(0);
  const [showInspectorNotes, setShowInspectorNotes] = useState(false);
  const [selectedInspectorNote, setSelectedInspectorNote] = useState<string | null>(null);
  const [showLookAway, setShowLookAway] = useState(false);
  const [revealedInspectorNote, setRevealedInspectorNote] = useState<string | null>(null);
  const [revealedNoteId, setRevealedNoteId] = useState<string | null>(null);
  const [noteWasFirstRead, setNoteWasFirstRead] = useState(false);
  const [forceRevealSymbols, setForceRevealSymbols] = useState(false);
  const [hostNotice, setHostNotice] = useState<string | null>(null);
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);
  const [pendingPhoneContinue, setPendingPhoneContinue] = useState<null | "use_secret_passage" | "make_suggestion" | "reveal_clue">(null);
  const previousTurnKey = useRef<string | null>(null);
  const gameProgress = game?.totalClues ? game.currentClueIndex / game.totalClues : 0;
  const phoneSessionCode = game?.phoneSessionCode ?? null;
  const isPhoneLobbyActive = Boolean(phoneSessionCode)
    && phoneLobbyStatus !== "closed"
    && phoneLobbyStatus !== "missing";
  const butlerClueImages = [
    "/images/ui/Butler Image.png",
    "/images/ui/Butler Image 2.png",
  ];
  const butlerImageIndex = game ? game.currentClueIndex % butlerClueImages.length : 0;
  const inspectorInterruptionImages = [
    "/images/ui/Inspector Brown 2.png",
    "/images/ui/Inspector Brown.png",
    "/images/ui/Inspector Brown 3.png",
  ];
  const note1Available = gameProgress >= 0.5;
  const note2Available = gameProgress >= 0.65;

  const loadGame = useCallback(() => {
    setLoading(true);
    setError(null);
    try {
      const data = gameStore.getGameData(gameId);
      if (!data) {
        setError("Game not found");
      } else {
        setGame(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load game");
    }
    setLoading(false);
  }, [gameId]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  useEffect(() => {
    if (!game || (game.status !== "in_progress" && game.status !== "setup")) return;
    const code = phoneSessionCode;
    if (!code) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await getSessionEvents(code, lastPhoneEventId ?? undefined);
        if (!data.events.length) return;
        for (const event of data.events) {
          setLastPhoneEventId(event.id);
          if (event.type === "turn_action") {
            const action = event.payload.action;
            if (typeof action !== "string") continue;
            if (action === "begin_investigation") {
              if (game.status === "setup") {
                handleStartGame();
              }
            } else if (action === "toggle_setup_symbols" && game.status === "setup") {
              setForceRevealSymbols((prev) => !prev);
            } else if (action === "continue_investigation") {
              setShowAccusation(false);
              setPhoneAccusation(null);
              if (pendingPhoneContinue === "reveal_clue") {
                setShowClueReveal(false);
                setPendingPhoneContinue(null);
                continue;
              }
              if (showInterruptionIntro) {
                acknowledgeInterruptionIntro();
              } else if (showInterruption) {
                closeInterruption();
              }
              if (pendingPhoneContinue === "make_suggestion") {
                handleEndTurn();
              } else if (pendingPhoneContinue === "use_secret_passage") {
                closeSecretPassage();
              }
              setPendingPhoneContinue(null);
            } else if (action === "reveal_clue" && game.status === "in_progress" && !revealingClue) {
              handleRevealClue();
              setPendingPhoneContinue("reveal_clue");
            } else if (action === "use_secret_passage" && game.status === "in_progress") {
              handleSecretPassage();
              setPendingPhoneContinue("use_secret_passage");
            } else if (action === "read_inspector_note" && game.status === "in_progress") {
              const noteId = typeof event.payload.noteId === "string" ? event.payload.noteId : "";
              const readerId = game.currentTurn?.suspectId || "";
              if (!noteId || !readerId) {
                setHostNotice("Inspector note request was incomplete.");
                continue;
              }
              try {
                const result = gameStore.readInspectorNote(gameId, noteId, readerId);
                await sendInspectorNoteResult(code, readerId, result.noteId, result.text);
                gameStore.endTurn(gameId);
                loadGame();
              } catch (err) {
                setHostNotice(err instanceof Error ? err.message : "Unable to read inspector note.");
              }
            } else if (action === "show_story" && game.status === "in_progress") {
              setShowNarrative((prev) => !prev);
            } else if (action === "make_suggestion" && game.status === "in_progress") {
              setShowEndTurnConfirm(true);
              setPendingPhoneContinue("make_suggestion");
            } else if (action === "acknowledge_interruption") {
              if (showInterruptionIntro) {
                acknowledgeInterruptionIntro();
              } else if (showInterruption) {
                closeInterruption();
              }
            }
          } else if (event.type === "accusation") {
            if (game.status !== "in_progress") continue;
            const suspectId = typeof event.payload.suspectId === "string" ? event.payload.suspectId : "";
            const itemId = typeof event.payload.itemId === "string" ? event.payload.itemId : "";
            const locationId = typeof event.payload.locationId === "string" ? event.payload.locationId : "";
            const timeId = typeof event.payload.timeId === "string" ? event.payload.timeId : "";
            if (suspectId && itemId && locationId && timeId) {
              setPhoneAccusation({ suspectId, itemId, locationId, timeId });
              setShowAccusation(true);
            }
          }
        }
      } catch {
        // Ignore polling errors so the game UI stays responsive.
      }
    }, 1200);
    return () => window.clearInterval(interval);
  }, [game, lastPhoneEventId, pendingPhoneContinue, revealingClue, showInterruption, showInterruptionIntro]);

  useEffect(() => {
    if (!phoneSessionCode) {
      setPhoneLobbyStatus(null);
      return;
    }
    let active = true;
    const poll = async () => {
      try {
        const data = await getSession(phoneSessionCode);
        if (active) {
          setPhoneLobbyStatus(data.session.status);
        }
      } catch {
        if (active) {
          setPhoneLobbyStatus("missing");
        }
      }
    };
    poll();
    const interval = window.setInterval(poll, 3000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [phoneSessionCode]);

  useEffect(() => {
    if (!game || (game.status !== "in_progress" && game.status !== "setup")) return;
    const code = phoneSessionCode;
    if (!code) return;
    const suspectId = game.status === "in_progress"
      ? game.currentTurn?.suspectId || null
      : null;
    updateSessionTurn(code, suspectId).catch(() => undefined);
  }, [game?.currentTurn?.suspectId, game?.status]);

  useEffect(() => {
    if (!game || game.status !== "in_progress") return;
    const code = phoneSessionCode;
    if (!code) return;
    updateInspectorNoteAvailability(code, { note1Available, note2Available }).catch(() => undefined);
  }, [game?.status, note1Available, note2Available, phoneSessionCode]);

  useEffect(() => {
    if (!game || game.status !== "in_progress") return;
    const code = phoneSessionCode;
    if (!code) return;
    updateInterruptionStatus(code, {
      active: showInterruption || showInterruptionIntro,
      message: showInterruption || showInterruptionIntro ? interruptionMessage : "",
    }).catch(() => undefined);
  }, [game?.status, interruptionMessage, phoneSessionCode, showInterruption, showInterruptionIntro]);

  useEffect(() => {
    if (!game?.startedAt || game.status !== "in_progress") return;
    const startMs = new Date(game.startedAt).getTime();
    const tick = () => {
      const now = Date.now();
      const activePauseMs = pauseStartRef.current ? now - pauseStartRef.current : 0;
      const diffMs = now - startMs - pauseAccumulatedRef.current - activePauseMs;
      setElapsedSeconds(Math.max(0, Math.floor(diffMs / 1000)));
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [game?.startedAt, game?.status]);

  useEffect(() => {
    const isPaused = showInterruption || showInterruptionIntro;
    if (isPaused && pauseStartRef.current === null) {
      pauseStartRef.current = Date.now();
    }
    if (!isPaused && pauseStartRef.current !== null) {
      pauseAccumulatedRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
  }, [showInterruption, showInterruptionIntro]);

  useEffect(() => {
    if (!showInterruption || inspectorInterruptionImages.length === 0) return;
    setInspectorImageIndex((prev) => (prev + 1) % inspectorInterruptionImages.length);
  }, [showInterruption, inspectorInterruptionImages.length]);

  useEffect(() => {
    if (!game?.startedAt || game.status !== "in_progress") return;
    if (game.nextInterruptionAtMinutes == null) return;
    if (showInterruption || showInterruptionIntro) return;

    const targetSeconds = game.nextInterruptionAtMinutes * 60;
    const remainingSeconds = targetSeconds - elapsedSeconds;
    const delay = Math.max(0, remainingSeconds * 1000);

    const timer = window.setTimeout(() => {
      try {
        const result = gameStore.triggerInspectorInterruption(gameId);
        setInterruptionMessage(result.message);
        setInterruptionType("inspector_note");
        setShowInterruptionIntro(true);
        loadGame();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to trigger interruption");
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    game?.startedAt,
    game?.status,
    game?.nextInterruptionAtMinutes,
    gameId,
    loadGame,
    elapsedSeconds,
    showInterruption,
    showInterruptionIntro,
  ]);

  useEffect(() => {
    if (!game || game.status !== "in_progress") return;
    if (game.roomsUnlocked) return;
    if (!game.lockedRooms || game.lockedRooms.length === 0) return;

    const totalButler = game.totalButlerClues;
    const revealedButler = game.revealedButlerClues;
    const butlerThresholdMet = totalButler > 0
      ? revealedButler >= Math.ceil(totalButler * 0.75)
      : false;

    const timeThresholdMet = elapsedSeconds >= 22 * 60;
    const turnThresholdMet = game.turnCount >= 10;

    if (!butlerThresholdMet && !timeThresholdMet && !turnThresholdMet) return;
    if (showInterruption || showInterruptionIntro) return;

    try {
      const result = gameStore.triggerRoomUnlock(gameId);
      setInterruptionMessage(result.message);
      setInterruptionType("unlock_rooms");
      setShowInterruptionIntro(true);
      loadGame();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to trigger room unlock");
    }
  }, [
    game,
    elapsedSeconds,
    gameId,
    loadGame,
    showInterruption,
    showInterruptionIntro,
  ]);

  useEffect(() => {
    if (!game || game.status !== "in_progress") return;
    if (showInterruption || showInterruptionIntro) return;

    const note1Ready = gameProgress >= 0.5;
    const note2Ready = gameProgress >= 0.65;

    if (note1Ready && !game.inspectorNoteAnnouncements.note1) {
      try {
        const result = gameStore.announceInspectorNote(gameId, "N1");
        setInterruptionMessage(result.message);
        setInterruptionType("inspector_note");
        setShowInterruptionIntro(true);
        loadGame();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to announce inspector note");
      }
      return;
    }

    if (note2Ready && !game.inspectorNoteAnnouncements.note2) {
      try {
        const result = gameStore.announceInspectorNote(gameId, "N2");
        setInterruptionMessage(result.message);
        setInterruptionType("turn_in_card");
        setShowInterruptionIntro(true);
        loadGame();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to announce inspector note");
      }
    }
  }, [
    game,
    gameProgress,
    gameId,
    loadGame,
    showInterruption,
    showInterruptionIntro,
  ]);
  useEffect(() => {
    if (!game?.currentTurn) return;
    const turnKey = `${game.currentTurnIndex}-${game.currentTurn.suspectId}`;
    if (previousTurnKey.current === turnKey) return;
    previousTurnKey.current = turnKey;
  }, [game?.currentTurn, game?.currentTurnIndex]);

  const handleStartGame = () => {
    try {
      setForceRevealSymbols(false);
      gameStore.startGame(gameId);
      loadGame();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start game");
    }
  };

  const handleRevealClue = () => {
    setRevealingClue(true);
    setLatestClue(null);
    try {
      const result = gameStore.revealNextClue(gameId);
      if (result.clue) {
        setLatestClue({
          speaker: result.clue.speaker,
          text: result.clue.text,
          eliminated: result.clue.eliminates ? {
            type: result.clue.eliminates.category,
            ids: result.clue.eliminates.ids,
          } : undefined,
        });
        setShowClueReveal(true);
      }
      loadGame();
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
  }): Promise<{ correct: boolean; message: string; aiResponse?: string; correctCount: number; wrongCount: number }> => {
    if (!game) {
      setError("Game not found");
      return { correct: false, message: "Game not found", correctCount: 0, wrongCount: 4 };
    }
    try {
      const result = gameStore.makeAccusation(gameId, {
        player: game.currentTurn?.playerName || "Detective",
        playerSuspectId: game.currentTurn?.suspectId,
        ...accusation,
      });
      const code = phoneSessionCode;
      if (code && game.currentTurn?.suspectId) {
        sendAccusationResult(code, game.currentTurn.suspectId, {
          correct: result.correct,
          correctCount: result.correctCount,
        }).catch(() => undefined);
      }
      loadGame();
      return {
        correct: result.correct,
        message: result.message,
        correctCount: result.correctCount,
        wrongCount: result.wrongCount,
      };
    } catch {
      return { correct: false, message: "Failed to make accusation", correctCount: 0, wrongCount: 4 };
    }
  };

  const handleSecretPassage = () => {
    try {
      const result = gameStore.useSecretPassage(gameId);
      setSecretPassageResult(result);
      loadGame();
    } catch (err) {
      setHostNotice(err instanceof Error ? err.message : "Secret passage already used this turn.");
    }
  };

  const handleResetPhoneLobby = async () => {
    const code = phoneSessionCode;
    if (!code) {
      onNavigate("/host-lobby");
      return;
    }
    try {
      await closeSession(code);
    } catch {
      // Still navigate home even if the close fails.
    }
    clearHostSessionCode();
    setHostAutoCreate(true);
    onNavigate("/host-lobby");
  };

  const handleExitToHome = () => {
    onNavigate("/");
  };

  const handleQuitGame = () => {
    const confirmed = window.confirm("End this game and delete it from the case files?");
    if (!confirmed) return;
    gameStore.deleteGame(gameId);
    onNavigate("/");
  };

  const handleOpenInspectorNotes = () => {
    setShowInspectorNotes(true);
    setSelectedInspectorNote(null);
    setShowLookAway(false);
    setRevealedInspectorNote(null);
  };

  const closeInspectorNotes = () => {
    if (noteWasFirstRead) {
      try {
        gameStore.endTurn(gameId);
        loadGame();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to end turn");
      }
    }
    setShowInspectorNotes(false);
    setSelectedInspectorNote(null);
    setShowLookAway(false);
    setRevealedInspectorNote(null);
    setRevealedNoteId(null);
    setNoteWasFirstRead(false);
  };

  const handleSelectInspectorNote = (noteId: string) => {
    setSelectedInspectorNote(noteId);
    setShowLookAway(true);
  };

  const handleRevealInspectorNote = () => {
    if (!game) {
      setError("Game not found");
      return;
    }
    if (!selectedInspectorNote) return;
    const readerId = game.currentTurn?.suspectId || "unknown";
    const readByPlayer = game.readInspectorNotes[readerId] || [];
    if (readByPlayer.includes(selectedInspectorNote)) {
      const note = game.inspectorNotes.find((item) => item.id === selectedInspectorNote);
      if (note) {
        setRevealedInspectorNote(note.text);
        setRevealedNoteId(selectedInspectorNote);
        setNoteWasFirstRead(false);
        setShowLookAway(false);
      } else {
        setError("Inspector note not found");
      }
      return;
    }

    try {
      const result = gameStore.readInspectorNote(gameId, selectedInspectorNote, readerId);
      setRevealedInspectorNote(result.text);
      setRevealedNoteId(selectedInspectorNote);
      setNoteWasFirstRead(true);
      setShowLookAway(false);
      loadGame();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read inspector note");
    }
  };

  const closeSecretPassage = () => {
    setSecretPassageResult(null);
    setPendingPhoneContinue(null);
  };

  const acknowledgeInterruptionIntro = () => {
    setShowInterruptionIntro(false);
    setShowInterruption(true);
  };

  const closeInterruption = () => {
    setShowInterruption(false);
  };

  const handleEndTurn = () => {
    try {
      gameStore.endTurn(gameId);
      loadGame();
      setShowEndTurnConfirm(false);
      setPendingPhoneContinue(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end turn");
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "setup": return "setup";
      case "in_progress": return "in-progress";
      case "solved": return "solved";
      case "abandoned": return "abandoned";
      default: return "secondary";
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <div className="loading-spinner mx-auto mb-4" />
        Loading investigation...
      </div>
    );
  }

  if (error || !game) {
    return (
      <Card className="text-center p-8">
        <CardHeader>
          <CardTitle>Investigation Not Found</CardTitle>
          <CardDescription>
            {error || "This case file cannot be located"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => onNavigate("/")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Return to Case Files
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isSetup = game.status === "setup";
  const isInProgress = game.status === "in_progress";
  const isSolved = game.status === "solved";
  const cluesRemaining = game.cluesRemaining;
  const progress = game.totalClues > 0
    ? (game.currentClueIndex / game.totalClues) * 100
    : 0;
  const secretPassageUsedThisTurn = game.secretPassageTurnUsedAt === game.turnCount;
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const elapsedLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const nextInterruptionSeconds = game.nextInterruptionAtMinutes !== null
    ? Math.max(0, game.nextInterruptionAtMinutes * 60 - elapsedSeconds)
    : null;
  const nextInterruptionLabel = nextInterruptionSeconds !== null
    ? `${Math.floor(nextInterruptionSeconds / 60)}:${(nextInterruptionSeconds % 60)
        .toString()
        .padStart(2, "0")}`
    : null;
  const currentReaderId = game.currentTurn?.suspectId || "unknown";
  const readByCurrentPlayer = game.readInspectorNotes[currentReaderId] || [];
  const currentTurnColor = game.currentTurn?.suspectId
    ? suspectColorById[game.currentTurn.suspectId] || "var(--color-primary)"
    : "var(--color-primary)";
  const canReadNote1 = note1Available || readByCurrentPlayer.includes("N1");
  const canReadNote2 = note2Available || readByCurrentPlayer.includes("N2");
  const hasInspectorNoteAvailable = canReadNote1 || canReadNote2;
  const note1Status = readByCurrentPlayer.includes("N1")
    ? "Read"
    : note1Available
      ? "Available"
      : "Unavailable";
  const note2Status = readByCurrentPlayer.includes("N2")
    ? "Read"
    : note2Available
      ? "Available"
      : "Unavailable";

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent>
          <div className="grid gap-6 items-center md:grid-cols-[1fr_auto_1fr]">
            {/* Left: Theme info */}
            <div className="min-w-0">
              <h2 className="mb-1 text-lg">{game.theme?.name || "Mystery"}</h2>
              <p className="text-muted-foreground text-sm leading-snug">
                {game.theme?.description || "A theft has occurred at Tudor Mansion"}
              </p>
            </div>

            {/* Center: Current Turn */}
            <div className="flex justify-center">
              {isInProgress && game.currentTurn && (
                <div className="text-center py-5 px-12 rounded-xl border-2 border-primary bg-secondary/80">
                  <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground mb-2">
                    Current Turn
                  </div>
                  <div
                    className="text-4xl md:text-5xl font-bold whitespace-nowrap"
                    style={{ color: currentTurnColor }}
                  >
                    {game.currentTurn.suspectName}
                  </div>
                </div>
              )}
              {!isInProgress && isSolved && game.solvedBy?.playerName && (
                <div className="text-center">
                  <div
                    className="flex items-center justify-center gap-3"
                    style={{ color: "var(--color-success)" }}
                  >
                    <CheckCircle className="h-7 w-7" />
                    <h2
                      className="text-3xl md:text-4xl uppercase tracking-[0.2em]"
                      style={{ color: "var(--color-success)" }}
                    >
                      Case Solved!
                    </h2>
                  </div>
                  <div className="mt-3 text-2xl md:text-3xl text-muted-foreground">
                    <div className="text-sm uppercase tracking-[0.16em] text-primary">
                      Winner
                    </div>
                    {game.solvedBy.playerName}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Status badge */}
            <div className="flex justify-end">
              <Badge variant={getStatusVariant(game.status) as "setup" | "in-progress" | "solved" | "abandoned"}>
                {game.status.replace("_", " ")}
              </Badge>
            </div>
          </div>
          {isInProgress && (
            <div className="mt-4 text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />
              DEV Game Timer: <span className="text-foreground font-semibold">{elapsedLabel}</span>
              {nextInterruptionLabel && (
                <span className="text-muted-foreground">
                  (DEV next interruption in {nextInterruptionLabel})
                </span>
              )}
            </div>
          )}

          {isInProgress && (
            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Clues Revealed: {game.currentClueIndex} / {game.totalClues}</span>
                <span>{cluesRemaining} remaining</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Button variant="outline" onClick={handleExitToHome}>
              Save & Exit
            </Button>
            <Button variant="destructive" onClick={handleQuitGame}>
              Exit Without Saving
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Setup Phase */}
      {isSetup && (
        <Card className="text-center">
          <CardHeader>
            <CardTitle>The Mystery Awaits</CardTitle>
            <CardDescription className="text-base max-w-2xl mx-auto">
              A theft has occurred at Tudor Mansion. Someone has stolen something valuable.
              Your task is to determine WHO did it, WHAT they stole, WHERE it happened, and WHEN.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-wrap justify-center gap-4 md:gap-6">
              <IconStat icon={Sparkles} className="capitalize">{game.difficulty}</IconStat>
              <IconStat icon={Users}>{game.playerCount} Players</IconStat>
              <IconStat icon={Clock}>{game.totalClues} Clues</IconStat>
            </div>

            {/* Opening Narrative */}
            {game.narrative?.opening && (
              <div className="bg-muted/50 rounded-lg p-4 text-left max-w-2xl mx-auto">
                <p className="italic text-muted-foreground">{game.narrative.opening}</p>
              </div>
            )}

            {game.lockedRooms.length > 0 && (
              <div className="bg-secondary/60 border border-primary/40 rounded-lg p-4 text-left max-w-2xl mx-auto">
                <h4 className="text-sm uppercase tracking-widest text-primary mb-2">
                  Locked Rooms
                </h4>
                <p className="text-sm text-muted-foreground mb-3">
                  Inspector Brown has ordered the following rooms sealed until further notice.
                </p>
                <div className="flex flex-wrap gap-2">
                  {game.lockedRooms.map((roomId) => (
                    <span
                      key={roomId}
                      className="px-3 py-1 rounded-full border border-primary/40 text-sm"
                    >
                      {getLocationName(roomId)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Solution Cards for Envelope */}
            {game.solution && (
              <SolutionCards solution={game.solution} forceReveal={forceRevealSymbols} />
            )}

            <Button
              size="lg"
              onClick={handleStartGame}
              disabled={isPhoneLobbyActive}
            >
              <Search className="mr-2 h-5 w-5" />
              Begin Investigation
            </Button>
            {isPhoneLobbyActive && (
              <p className="text-sm text-muted-foreground">
                Waiting for the lead detective to begin the investigation.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Active Game */}
      {isInProgress && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] gap-6">
          <div className="space-y-6">
            {/* Controls */}
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-lg">Turn Options</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      key: "reveal",
                      title: revealingClue ? "Revealing..." : "Reveal Next Clue",
                      description: "Share the next clue with the group.",
                      icon: Search,
                      onClick: handleRevealClue,
                      disabled: revealingClue || cluesRemaining === 0 || isPhoneLobbyActive,
                    },
                    {
                      key: "accuse",
                      title: "Make Accusation",
                      description: "Open the accusation flow on the host.",
                      icon: Gavel,
                      onClick: () => setShowAccusation(true),
                      disabled: isPhoneLobbyActive,
                    },
                    {
                      key: "passage",
                      title: "Use Secret Passage",
                      description: "Trigger a passage result for the current turn.",
                      icon: DoorOpen,
                      onClick: handleSecretPassage,
                      disabled: isPhoneLobbyActive || secretPassageUsedThisTurn,
                    },
                    {
                      key: "note",
                      title: "Read Inspector Note",
                      description: "Open the inspector note selection.",
                      icon: BookOpen,
                      onClick: handleOpenInspectorNotes,
                      disabled: !hasInspectorNoteAvailable || isPhoneLobbyActive,
                    },
                    {
                      key: "story",
                      title: showNarrative ? "Hide Story" : "Show Story",
                      description: "Toggle the narrative panel below.",
                      icon: BookOpen,
                      onClick: () => setShowNarrative(!showNarrative),
                      disabled: isPhoneLobbyActive,
                    },
                    {
                      key: "suggestion",
                      title: "Make Suggestion",
                      description: "Prompt players to handle a suggestion turn.",
                      icon: MessageCircle,
                      onClick: () => setShowEndTurnConfirm(true),
                      disabled: isPhoneLobbyActive,
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={item.onClick}
                        disabled={item.disabled}
                        className={`rounded-lg border px-4 py-3 text-left transition ${
                          item.disabled
                            ? "border-border/50 bg-muted/40 text-muted-foreground cursor-not-allowed"
                            : "border-primary/40 bg-card hover:border-primary/70 hover:bg-primary/5"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                          <Icon className="h-4 w-4 text-primary" />
                          {item.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.description}
                        </div>
                      </button>
                    );
                  })}
                  {isPhoneLobbyActive && (
                    <button
                      type="button"
                      onClick={handleResetPhoneLobby}
                      className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-left text-sm hover:border-primary/40 hover:bg-primary/5 transition"
                    >
                      <div className="font-semibold text-primary mb-1">Reset Phone Lobby</div>
                      <div className="text-xs text-muted-foreground">
                        Generate a new join code for the next session.
                      </div>
                    </button>
                  )}
                </div>
                {hostNotice && (
                  <div className="mt-3 text-sm text-muted-foreground">
                    {hostNotice}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Narrative Panel */}
            {showNarrative && game.narrative && (
              <Card>
                <CardHeader className="px-4 py-3">
                  <CardTitle className="text-lg">The Story So Far</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 p-4 text-sm">
                  {game.narrative.setting && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Setting</h4>
                      <p className="italic">{game.narrative.setting}</p>
                    </div>
                  )}
                  {game.narrative.atmosphere && (
                    <div>
                      <h4 className="text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">Atmosphere</h4>
                      <p className="italic">{game.narrative.atmosphere}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-lg">Turn Order</CardTitle>
                <CardDescription>Host-only view of the rotation.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Turn</span>
                  <span className="font-semibold">#{game.turnCount + 1}</span>
                </div>
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">Current Turn</div>
                  {game.currentTurn ? (
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: suspectColorById[game.currentTurn.suspectId] || "#b68b2d" }}
                      />
                      <span className="font-semibold">{game.currentTurn.playerName}</span>
                      <span className="text-muted-foreground">
                        ({game.currentTurn.suspectName})
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Awaiting start.</div>
                  )}
                </div>
                <div className="space-y-2">
                  {game.turnOrder.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Turn order set at investigation start.</div>
                  ) : (
                    <div className="space-y-2">
                      {game.turnOrder.map((player, index) => {
                        const isActive = index === game.currentTurnIndex;
                        return (
                          <div
                            key={`${player.name}-${player.suspectId}-${index}`}
                            className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${
                              isActive ? "border-primary/60 bg-primary/10" : "border-border/60 bg-muted/30"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: suspectColorById[player.suspectId] || "#b68b2d" }}
                              />
                              <span className={isActive ? "font-semibold" : undefined}>{player.name}</span>
                            </div>
                            <span className="text-xs uppercase tracking-wide text-muted-foreground">
                              {isActive ? "Now" : `#${index + 1}`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {/* Investigation Timeline */}
            <Card>
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-lg">Investigation Timeline</CardTitle>
                <CardDescription>Most recent events.</CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <GameHistory gameId={gameId} maxItems={4} compact />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Solved */}
      {isSolved && game.solution && (
        <Card className="border-success text-center">
          <CardHeader>
            <CardTitle className="text-primary text-3xl">
              Well Done, Detective!
            </CardTitle>
            <CardDescription className="text-base">
              The mystery has been unraveled.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="solution-reveal-grid">
              {[
                { label: "WHO", value: game.solution.suspectName, id: game.solution.suspectId },
                { label: "WHAT", value: game.solution.itemName, id: game.solution.itemId },
                { label: "WHERE", value: game.solution.locationName, id: game.solution.locationId },
                { label: "WHEN", value: game.solution.timeName, id: game.solution.timeId },
              ].map((card, index) => (
                <RevealCard
                  key={card.label}
                  label={card.label}
                  value={card.value}
                  imageSrc={solutionImageById[card.id]}
                  imageAlt={card.value}
                  index={index}
                />
              ))}
            </div>

            {/* Closing Narrative */}
            {game.narrative?.closing && (
              <div className="bg-muted/50 rounded-lg p-4 text-left max-w-2xl mx-auto">
                <p className="italic text-muted-foreground">{game.narrative.closing}</p>
              </div>
            )}

            <Button variant="outline" onClick={() => onNavigate("/")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Return to Case Files
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Accusation Modal */}
      {showAccusation && (
        <AccusationPanel
          eliminated={emptyEliminated}
          onClose={() => {
            setShowAccusation(false);
            setPhoneAccusation(null);
          }}
          onAccuse={handleAccusation}
          presetAccusation={phoneAccusation}
          autoSubmit={Boolean(phoneAccusation)}
        />
      )}

      {secretPassageResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 host-modal-overlay">
          <Card className="host-modal-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-3xl md:text-4xl">
                <DoorOpen className="h-5 w-5 text-primary" />
                Secret Passage
              </CardTitle>
              <CardDescription className="text-lg md:text-xl">
                {secretPassageResult.outcome === "good" && "Fortune favors you."}
                {secretPassageResult.outcome === "neutral" && "You pass unseen."}
                {secretPassageResult.outcome === "bad" && "A complication arises."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 host-modal-body">
              <p className="italic">{secretPassageResult.description}</p>
              <div className="text-muted-foreground">
                Your turn continues.
              </div>
            </CardContent>
            <CardContent className="pt-0">
              {pendingPhoneContinue === "use_secret_passage" ? (
                <p className="text-muted-foreground host-modal-body">
                  Waiting for the detective to continue from their phone.
                </p>
              ) : (
                <Button size="lg" onClick={closeSecretPassage}>Continue</Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showInterruptionIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 host-modal-overlay">
          <Card className="host-modal-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-3xl md:text-4xl">
                <Bell className="h-5 w-5 text-primary" />
                Inspector Interruption
              </CardTitle>
              <CardDescription className="text-lg md:text-xl">
                Inspector Brown would like to see you.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <img
                src="/images/ui/Inspector screen.png"
                alt="Inspector screen"
                className="host-modal-image"
              />
            </CardContent>
            <CardContent className="pt-0">
              <Button size="lg" onClick={acknowledgeInterruptionIntro}>OK</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showInterruption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 host-modal-overlay">
          <Card className="host-modal-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-3xl md:text-4xl">
                <Bell className="h-5 w-5 text-primary" />
                Inspector Interruption
              </CardTitle>
              <CardDescription className="text-lg md:text-xl">
                Inspector Brown has an instruction for the table.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 host-modal-body">
              <p className="italic">
                {interruptionMessage || "Inspector Brown calls for an immediate pause in the investigation."}
              </p>
            </CardContent>
            <CardContent className="pt-0">
              <img
                src={inspectorInterruptionImages[inspectorImageIndex]}
                alt="Inspector Brown"
                className="host-modal-image"
              />
            </CardContent>
            <CardContent className="pt-0">
              <Button size="lg" onClick={closeInterruption}>Continue</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showClueReveal && latestClue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 host-modal-overlay">
          <Card className="host-modal-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-3xl md:text-4xl">
                <Bell className="h-5 w-5 text-primary" />
                New Clue
              </CardTitle>
              <CardDescription className="text-lg md:text-xl">
                Inspector Brown has discovered a fresh lead.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-6 host-modal-body">
              <img
                src={butlerClueImages[butlerImageIndex]}
                alt="Butler"
                className="host-modal-image"
              />
              <ClueDisplay
                speaker={latestClue.speaker}
                text={latestClue.text}
                eliminated={latestClue.eliminated ? {
                  type: latestClue.eliminated.type,
                  id: latestClue.eliminated.ids[0],
                } : undefined}
                index={game.currentClueIndex}
              />
            </CardContent>
            <CardContent className="pt-0">
              <Button size="lg" onClick={() => setShowClueReveal(false)}>Continue</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showInspectorNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 host-modal-overlay">
          <Card className="host-modal-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-3xl md:text-4xl">
                <BookOpen className="h-5 w-5 text-primary" />
                Inspector's Notes
              </CardTitle>
              <CardDescription className="text-lg md:text-xl">
                Select a note to read. Only the current player should view the contents.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 host-modal-body">
              {!showLookAway && !revealedInspectorNote && (
                <div className="grid gap-3 md:grid-cols-2">
                  <button
                    className="rounded-lg border border-primary/40 bg-secondary/40 px-4 py-3 text-left transition hover:border-primary disabled:opacity-50"
                    disabled={!canReadNote1}
                    onClick={() => handleSelectInspectorNote("N1")}
                  >
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      Note 1
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {note1Status}
                    </div>
                  </button>
                  <button
                    className="rounded-lg border border-primary/40 bg-secondary/40 px-4 py-3 text-left transition hover:border-primary disabled:opacity-50"
                    disabled={!canReadNote2}
                    onClick={() => handleSelectInspectorNote("N2")}
                  >
                    <div className="text-xs uppercase tracking-widest text-muted-foreground">
                      Note 2
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {note2Status}
                    </div>
                  </button>
                </div>
              )}

              {showLookAway && !revealedInspectorNote && (
                <div className="rounded-lg border border-primary/40 bg-secondary/40 p-4 text-center space-y-4">
                  <p className="text-muted-foreground">
                    Other players should look away now.
                  </p>
                  <Button size="lg" onClick={handleRevealInspectorNote}>
                    Reveal Note
                  </Button>
                </div>
              )}

              {revealedInspectorNote && (
                <div className="rounded-lg border border-primary/40 bg-secondary/40 p-4 space-y-3">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Confidential {revealedNoteId ? `(${revealedNoteId})` : ""}
                  </div>
                  <p className="italic">{revealedInspectorNote}</p>
                </div>
              )}
            </CardContent>
            <CardContent className="pt-0 flex justify-between items-center">
              <Button size="lg" variant="outline" onClick={closeInspectorNotes}>
                Close
              </Button>
              {revealedInspectorNote && (
                <span className="text-muted-foreground host-modal-body">
                  {noteWasFirstRead ? "This ends your turn." : "You may continue your turn."}
                </span>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showEndTurnConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6 host-modal-overlay">
          <Card className="host-modal-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-3xl md:text-4xl">
                <MessageCircle className="h-5 w-5 text-primary" />
                Make Suggestion
              </CardTitle>
              <CardDescription className="text-lg md:text-xl">
                Announce your suggestion to the table. Once resolved, click Confirm Suggestion to end your turn.
              </CardDescription>
            </CardHeader>
            {pendingPhoneContinue === "make_suggestion" ? (
              <CardContent>
                <p className="text-muted-foreground host-modal-body">
                  Waiting for the detective to continue from their phone.
                </p>
              </CardContent>
            ) : (
              <CardContent className="flex gap-3">
                <Button size="lg" variant="outline" onClick={() => setShowEndTurnConfirm(false)}>
                  Cancel
                </Button>
                <Button size="lg" onClick={handleEndTurn}>
                  Confirm Suggestion
                </Button>
              </CardContent>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function RevealCard({
  label,
  value,
  index,
  imageSrc,
  imageAlt,
}: {
  label: string;
  value: string;
  index: number;
  imageSrc?: string;
  imageAlt?: string;
}) {
  const [flipped, setFlipped] = useState(false);

  return (
    <button
      className={`reveal-card ${flipped ? "reveal-card-flipped" : ""}`}
      onClick={() => setFlipped((current) => !current)}
      aria-label={`Reveal ${label}`}
      style={{ transitionDelay: `${index * 60}ms` }}
      type="button"
    >
      <div className="reveal-card-inner">
        <div className="reveal-card-face reveal-card-front">
          <span className="reveal-card-label">{label}</span>
          <span className="reveal-card-divider" aria-hidden="true" />
          <span className="reveal-card-hint">Tap to reveal</span>
        </div>
        <div className="reveal-card-face reveal-card-back">
          <span className="reveal-card-label">{label}</span>
          {imageSrc && (
            <div className="reveal-card-media">
              <img className="reveal-card-image" src={imageSrc} alt={imageAlt || value} />
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
