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
import { closeSession, sendAccusationResult, sendInspectorNoteResult, updateInspectorNoteAvailability, updateInterruptionStatus, updateSessionTurn } from "../phone/api";
import { clearHostSessionCode, setHostAutoCreate } from "../phone/storage";
import type { PhoneSessionStatus } from "../../phone/types";
import { connectPhoneSessionSocket } from "../phone/ws";

interface Props {
  gameId: string;
  onNavigate: (path: string) => void;
  onMusicPauseChange?: (paused: boolean) => void;
}

const suspectColorById: Record<string, string> = {
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

export default function GamePage({ gameId, onNavigate, onMusicPauseChange }: Props) {
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
  const lastPhoneEventIdRef = useRef<number | null>(null);
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
  const gameRef = useRef<GameDataFormatted | null>(null);
  const pendingPhoneContinueRef = useRef<null | "use_secret_passage" | "make_suggestion" | "reveal_clue">(null);
  const revealingClueRef = useRef(false);
  const showInterruptionRef = useRef(false);
  const showInterruptionIntroRef = useRef(false);
  const handleStartGameRef = useRef<() => void>(() => undefined);
  const handleRevealClueRef = useRef<() => void>(() => undefined);
  const handleSecretPassageRef = useRef<() => void>(() => undefined);
  const handleEndTurnRef = useRef<() => void>(() => undefined);
  const closeSecretPassageRef = useRef<() => void>(() => undefined);
  const acknowledgeInterruptionIntroRef = useRef<() => void>(() => undefined);
  const closeInterruptionRef = useRef<() => void>(() => undefined);
  const loadGameRef = useRef<() => void>(() => undefined);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSpokenRef = useRef<string | null>(null);
  const gameProgress = game?.totalClues ? game.currentClueIndex / game.totalClues : 0;
  const phoneSessionCode = game?.phoneSessionCode ?? null;
  const isPhoneLobbyActive = Boolean(phoneSessionCode)
    && phoneLobbyStatus !== "closed"
    && phoneLobbyStatus !== "missing";
  const butlerClueImages = [
    "/images/ui/Butler Image.png",
    "/images/ui/Butler Image 2.png",
  ];

  const interruptionIntroText = "Inspector Brown would like to see you.";
  const interruptionFallbackText = "Inspector Brown calls for an immediate pause in the investigation.";

  const playVoiceover = useCallback(async (text: string, role: "butler" | "inspector") => {
    if (!text) return;
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, role }),
      });
      if (!response.ok) return;
      const blob = await response.blob();
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.pause();
      audio.currentTime = 0;
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
    } catch {
      // Ignore voiceover errors to keep gameplay moving.
    }
  }, []);
  const butlerImageIndex = game ? game.currentClueIndex % butlerClueImages.length : 0;
  const inspectorInterruptionImages = [
    "/images/ui/Inspector Brown 2.png",
    "/images/ui/Inspector Brown.png",
    "/images/ui/Inspector Brown 3.png",
  ];
  const note1Available = gameProgress >= 0.5;
  const note2Available = gameProgress >= 0.65;
  const shouldPauseMusic = showClueReveal
    || showInterruption
    || showAccusation
    || showInspectorNotes
    || showLookAway
    || showEndTurnConfirm
    || showNarrative
    || Boolean(secretPassageResult);

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
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    pendingPhoneContinueRef.current = pendingPhoneContinue;
  }, [pendingPhoneContinue]);

  useEffect(() => {
    revealingClueRef.current = revealingClue;
  }, [revealingClue]);

  useEffect(() => {
    showInterruptionRef.current = showInterruption;
  }, [showInterruption]);

  useEffect(() => {
    showInterruptionIntroRef.current = showInterruptionIntro;
  }, [showInterruptionIntro]);


  useEffect(() => {
    const status = game?.status;
    if (!phoneSessionCode || (status !== "in_progress" && status !== "setup")) return;
    const disconnect = connectPhoneSessionSocket(
      phoneSessionCode,
      {
        onSession: ({ session }) => {
          setPhoneLobbyStatus(session.status);
        },
        onEvent: (event) => {
          const currentGame = gameRef.current;
          if (!currentGame) return;
          lastPhoneEventIdRef.current = event.id;
          setLastPhoneEventId(event.id);
          if (event.type === "turn_action") {
            const action = event.payload.action;
            if (typeof action !== "string") return;
            if (action === "begin_investigation") {
              if (currentGame.status === "setup") {
                handleStartGameRef.current();
              }
            } else if (action === "toggle_setup_symbols" && currentGame.status === "setup") {
              setForceRevealSymbols((prev) => !prev);
            } else if (action === "continue_investigation") {
              setShowAccusation(false);
              setPhoneAccusation(null);
              if (pendingPhoneContinueRef.current === "reveal_clue") {
                setShowClueReveal(false);
                setPendingPhoneContinue(null);
                return;
              }
              if (showInterruptionIntroRef.current) {
                acknowledgeInterruptionIntroRef.current();
              } else if (showInterruptionRef.current) {
                closeInterruptionRef.current();
              }
              if (pendingPhoneContinueRef.current === "make_suggestion") {
                handleEndTurnRef.current();
              } else if (pendingPhoneContinueRef.current === "use_secret_passage") {
                closeSecretPassageRef.current();
              }
              setPendingPhoneContinue(null);
            } else if (
              action === "reveal_clue"
              && currentGame.status === "in_progress"
              && !revealingClueRef.current
            ) {
              handleRevealClueRef.current();
              setPendingPhoneContinue("reveal_clue");
            } else if (action === "use_secret_passage" && currentGame.status === "in_progress") {
              handleSecretPassageRef.current();
              setPendingPhoneContinue("use_secret_passage");
            } else if (action === "read_inspector_note" && currentGame.status === "in_progress") {
              const noteId = typeof event.payload.noteId === "string" ? event.payload.noteId : "";
              const readerId = currentGame.currentTurn?.suspectId || "";
              if (!noteId || !readerId) {
                setHostNotice("Inspector note request was incomplete.");
                return;
              }
              void (async () => {
                try {
                  const result = gameStore.readInspectorNote(gameId, noteId, readerId);
                  await sendInspectorNoteResult(phoneSessionCode, readerId, result.noteId, result.text);
                  gameStore.endTurn(gameId);
                  loadGameRef.current();
                } catch (err) {
                  setHostNotice(err instanceof Error ? err.message : "Unable to read inspector note.");
                }
              })();
            } else if (action === "show_story" && currentGame.status === "in_progress") {
              setShowNarrative((prev) => !prev);
            } else if (action === "make_suggestion" && currentGame.status === "in_progress") {
              setShowEndTurnConfirm(true);
              setPendingPhoneContinue("make_suggestion");
            } else if (action === "acknowledge_interruption") {
              if (showInterruptionIntroRef.current) {
                acknowledgeInterruptionIntroRef.current();
              } else if (showInterruptionRef.current) {
                closeInterruptionRef.current();
              }
            }
          } else if (event.type === "accusation") {
            if (currentGame.status !== "in_progress") return;
            const suspectId = typeof event.payload.suspectId === "string" ? event.payload.suspectId : "";
            const itemId = typeof event.payload.itemId === "string" ? event.payload.itemId : "";
            const locationId = typeof event.payload.locationId === "string" ? event.payload.locationId : "";
            const timeId = typeof event.payload.timeId === "string" ? event.payload.timeId : "";
            if (suspectId && itemId && locationId && timeId) {
              setPhoneAccusation({ suspectId, itemId, locationId, timeId });
              setShowAccusation(true);
            }
          }
        },
      },
      {
        getLastEventId: () => lastPhoneEventIdRef.current,
      }
    );
    return () => disconnect();
  }, [
    gameId,
    phoneSessionCode,
    game?.status,
  ]);

  useEffect(() => {
    if (!phoneSessionCode) {
      setPhoneLobbyStatus(null);
      return;
    }
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

  useEffect(() => {
    if (!onMusicPauseChange) return;
    onMusicPauseChange(shouldPauseMusic);
    return () => onMusicPauseChange(false);
  }, [onMusicPauseChange, shouldPauseMusic]);

  useEffect(() => {
    if (!showClueReveal || !latestClue?.text) return;
    const key = `clue:${latestClue.text}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    const speaker = latestClue.speaker?.toLowerCase() ?? "";
    const role = speaker.includes("inspector") ? "inspector" : "butler";
    playVoiceover(latestClue.text, role);
  }, [latestClue?.speaker, latestClue?.text, playVoiceover, showClueReveal]);

  useEffect(() => {
    if (!showInterruption && !showInterruptionIntro) return;
    const message = showInterruptionIntro
      ? interruptionIntroText
      : (interruptionMessage || interruptionFallbackText);
    const key = `interruption:${showInterruptionIntro ? "intro" : "main"}:${message}`;
    if (lastSpokenRef.current === key) return;
    lastSpokenRef.current = key;
    playVoiceover(message, "inspector");
  }, [
    interruptionFallbackText,
    interruptionIntroText,
    interruptionMessage,
    playVoiceover,
    showInterruption,
    showInterruptionIntro,
  ]);

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
        const speaker = result.clue.speaker?.toLowerCase() ?? "";
        const role = speaker.includes("inspector") ? "inspector" : "butler";
        setLatestClue({
          speaker: result.clue.speaker,
          text: result.clue.text,
          eliminated: result.clue.eliminates ? {
            type: result.clue.eliminates.category,
            ids: result.clue.eliminates.ids,
          } : undefined,
        });
        setShowClueReveal(true);
        playVoiceover(result.clue.text, role);
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

  useEffect(() => {
    handleStartGameRef.current = handleStartGame;
    handleRevealClueRef.current = handleRevealClue;
    handleSecretPassageRef.current = handleSecretPassage;
    handleEndTurnRef.current = handleEndTurn;
    closeSecretPassageRef.current = closeSecretPassage;
    acknowledgeInterruptionIntroRef.current = acknowledgeInterruptionIntro;
    closeInterruptionRef.current = closeInterruption;
    loadGameRef.current = loadGame;
  }, [
    handleStartGame,
    handleRevealClue,
    handleSecretPassage,
    handleEndTurn,
    closeSecretPassage,
    acknowledgeInterruptionIntro,
    closeInterruption,
    loadGame,
  ]);

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
    <div className="game-page">
      {/* Game Header */}
      <header className="game-header">
        <div className="game-header-inner">
          {/* Art Deco corner ornaments */}
          <div className="game-header-corner game-header-corner-tl" />
          <div className="game-header-corner game-header-corner-tr" />

          {/* Top decorative line */}
          <div className="game-header-deco-line" />

          {/* Theme & Status Row */}
          <div className="game-header-top">
            <div className="game-header-theme">
              <span className="game-header-theme-label">Case File</span>
              <h2 className="game-header-theme-name">{game.theme?.name || "Mystery"}</h2>
            </div>
            <Badge variant={getStatusVariant(game.status) as "setup" | "in-progress" | "solved" | "abandoned"}>
              {game.status.replace("_", " ")}
            </Badge>
          </div>

          {/* Center: Current Turn Display */}
          {isInProgress && game.currentTurn && (
            <div className="game-header-turn">
              <div className="game-header-turn-label">Current Turn</div>
              <div className="game-header-turn-divider">
                <span className="game-header-turn-divider-line" />
                <span className="game-header-turn-divider-diamond" />
                <span className="game-header-turn-divider-line" />
              </div>
              <div
                className="game-header-turn-name"
                style={{ color: currentTurnColor, textShadow: `0 0 30px ${currentTurnColor}40` }}
              >
                {game.currentTurn.suspectName}
              </div>
              <div className="game-header-turn-player">
                <Users className="w-3.5 h-3.5" />
                {game.currentTurn.playerName}
              </div>
            </div>
          )}

          {/* Solved State Header */}
          {!isInProgress && isSolved && game.solvedBy?.playerName && (
            <div className="game-header-solved">
              <div className="game-header-solved-badge">
                <CheckCircle className="h-6 w-6" />
                <span>Case Solved</span>
              </div>
              <div className="game-header-solved-winner">
                <span className="game-header-solved-winner-label">Winner</span>
                <span className="game-header-solved-winner-name">{game.solvedBy.playerName}</span>
              </div>
            </div>
          )}

          {/* Progress Section */}
          {isInProgress && (
            <div className="game-header-progress">
              <div className="game-header-progress-stats">
                <div className="game-header-stat">
                  <Clock className="w-4 h-4" />
                  <span className="game-header-stat-value">{elapsedLabel}</span>
                  <span className="game-header-stat-label">Elapsed</span>
                </div>
                <div className="game-header-stat">
                  <Search className="w-4 h-4" />
                  <span className="game-header-stat-value">{game.currentClueIndex}</span>
                  <span className="game-header-stat-label">of {game.totalClues} Clues</span>
                </div>
                <div className="game-header-stat">
                  <span className="game-header-stat-value">#{game.turnCount + 1}</span>
                  <span className="game-header-stat-label">Turn</span>
                </div>
              </div>
              <div className="game-header-progress-bar">
                <div
                  className="game-header-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="game-header-actions">
            <button className="game-header-action" onClick={handleExitToHome}>
              <ArrowLeft className="w-4 h-4" />
              Save & Exit
            </button>
            <button className="game-header-action game-header-action-danger" onClick={handleQuitGame}>
              Exit Without Saving
            </button>
          </div>
        </div>
      </header>

      {/* Setup Phase */}
      {isSetup && (
        <main className="game-setup">
          <div className="game-setup-inner">
            {/* Left Column: Info */}
            <div className="game-setup-left">
              {/* Setup Header */}
              <div className="game-setup-header">
                <div className="game-setup-header-deco">
                  <span className="game-setup-header-deco-line" />
                  <span className="game-setup-header-deco-diamond" />
                  <span className="game-setup-header-deco-line" />
                </div>
                <h2 className="game-setup-title">The Mystery Awaits</h2>
                <p className="game-setup-subtitle">
                  A theft has occurred at Tudor Mansion. Someone has stolen something valuable.
                  Your task is to determine WHO did it, WHAT they stole, WHERE it happened, and WHEN.
                </p>
              </div>

              {/* Game Stats */}
              <div className="game-setup-stats">
                <div className="game-setup-stat">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <span className="game-setup-stat-value capitalize">{game.difficulty}</span>
                  <span className="game-setup-stat-label">Difficulty</span>
                </div>
                <div className="game-setup-stat">
                  <Users className="w-5 h-5 text-primary" />
                  <span className="game-setup-stat-value">{game.playerCount}</span>
                  <span className="game-setup-stat-label">Players</span>
                </div>
                <div className="game-setup-stat">
                  <Search className="w-5 h-5 text-primary" />
                  <span className="game-setup-stat-value">{game.totalClues}</span>
                  <span className="game-setup-stat-label">Clues</span>
                </div>
              </div>

              {/* Opening Narrative */}
              {game.narrative?.opening && (
                <div className="game-setup-narrative">
                  <div className="game-setup-narrative-icon">
                    <BookOpen className="w-5 h-5" />
                  </div>
                  <p className="game-setup-narrative-text">{game.narrative.opening}</p>
                </div>
              )}

              {/* Locked Rooms */}
              {game.lockedRooms.length > 0 && (
                <div className="game-setup-locked">
                  <div className="game-setup-locked-header">
                    <DoorOpen className="w-4 h-4" />
                    <h4>Sealed Rooms</h4>
                  </div>
                  <p className="game-setup-locked-text">
                    Inspector Brown has ordered the following rooms sealed until further notice.
                  </p>
                  <div className="game-setup-locked-rooms">
                    {game.lockedRooms.map((roomId) => (
                      <span key={roomId} className="game-setup-locked-room">
                        {getLocationName(roomId)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Cards + Actions */}
            <div className="game-setup-right">
              {/* Solution Cards for Envelope */}
              {game.solution && (
                <SolutionCards solution={game.solution} forceReveal={forceRevealSymbols} />
              )}

              {/* Begin Button */}
              <div className="game-setup-actions">
                <button
                  className="game-setup-begin-btn"
                  onClick={handleStartGame}
                  disabled={isPhoneLobbyActive}
                >
                  <Search className="w-5 h-5" />
                  Begin Investigation
                </button>
                {isPhoneLobbyActive && (
                  <p className="game-setup-waiting">
                    Waiting for the lead detective to begin the investigation.
                  </p>
                )}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Active Game */}
      {isInProgress && (
        <main className="game-active">
          <div className="game-active-grid">
            {/* Left Column: Controls */}
            <div className="game-active-left">
              {/* Turn Actions Panel */}
              <section className="game-panel game-panel-actions">
                <div className="game-panel-header">
                  <div className="game-panel-header-icon">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="game-panel-title">Turn Actions</h3>
                </div>
                <div className="game-panel-body">
                  <div className="game-actions-grid">
                    {[
                      {
                        key: "reveal",
                        title: revealingClue ? "Revealing..." : "Reveal Clue",
                        description: "Share the next clue with the group",
                        icon: Search,
                        onClick: handleRevealClue,
                        disabled: revealingClue || cluesRemaining === 0 || isPhoneLobbyActive,
                        highlight: !revealingClue && cluesRemaining > 0,
                      },
                      {
                        key: "accuse",
                        title: "Accusation",
                        description: "Make a formal accusation",
                        icon: Gavel,
                        onClick: () => setShowAccusation(true),
                        disabled: isPhoneLobbyActive,
                      },
                      {
                        key: "passage",
                        title: "Secret Passage",
                        description: "Use a hidden passage",
                        icon: DoorOpen,
                        onClick: handleSecretPassage,
                        disabled: isPhoneLobbyActive || secretPassageUsedThisTurn,
                      },
                      {
                        key: "note",
                        title: "Inspector Note",
                        description: "Read a confidential note",
                        icon: BookOpen,
                        onClick: handleOpenInspectorNotes,
                        disabled: !hasInspectorNoteAvailable || isPhoneLobbyActive,
                      },
                      {
                        key: "suggestion",
                        title: "Suggestion",
                        description: "End turn after suggestion",
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
                          className={`game-action-btn ${item.disabled ? "game-action-btn-disabled" : ""} ${item.highlight ? "game-action-btn-highlight" : ""}`}
                        >
                          <div className="game-action-btn-icon">
                            <Icon className="w-5 h-5" />
                          </div>
                          <div className="game-action-btn-content">
                            <span className="game-action-btn-title">{item.title}</span>
                            <span className="game-action-btn-desc">{item.description}</span>
                          </div>
                        </button>
                      );
                    })}
                    {isPhoneLobbyActive && (
                      <button
                        type="button"
                        onClick={handleResetPhoneLobby}
                        className="game-action-btn game-action-btn-secondary"
                      >
                        <div className="game-action-btn-icon">
                          <Users className="w-5 h-5" />
                        </div>
                        <div className="game-action-btn-content">
                          <span className="game-action-btn-title">Reset Lobby</span>
                          <span className="game-action-btn-desc">Generate new join code</span>
                        </div>
                      </button>
                    )}
                  </div>
                  {hostNotice && (
                    <div className="game-panel-notice">{hostNotice}</div>
                  )}
                </div>
              </section>

              {/* Narrative Panel (toggleable) */}
              {showNarrative && game.narrative && (
                <section className="game-panel game-panel-narrative">
                  <div className="game-panel-header">
                    <div className="game-panel-header-icon">
                      <BookOpen className="w-4 h-4" />
                    </div>
                    <h3 className="game-panel-title">The Story So Far</h3>
                  </div>
                  <div className="game-panel-body">
                    {game.narrative.setting && (
                      <div className="game-narrative-section">
                        <h4 className="game-narrative-label">Setting</h4>
                        <p className="game-narrative-text">{game.narrative.setting}</p>
                      </div>
                    )}
                    {game.narrative.atmosphere && (
                      <div className="game-narrative-section">
                        <h4 className="game-narrative-label">Atmosphere</h4>
                        <p className="game-narrative-text">{game.narrative.atmosphere}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Turn Order Panel */}
              <section className="game-panel game-panel-turns">
                <div className="game-panel-header">
                  <div className="game-panel-header-icon">
                    <Users className="w-4 h-4" />
                  </div>
                  <h3 className="game-panel-title">Turn Order</h3>
                </div>
                <div className="game-panel-body">
                  <div className="game-turn-list">
                    {game.turnOrder.length === 0 ? (
                      <div className="game-turn-empty">Turn order set at investigation start.</div>
                    ) : (
                      game.turnOrder.map((player, index) => {
                        const isActive = index === game.currentTurnIndex;
                        const color = suspectColorById[player.suspectId] || "#b68b2d";
                        return (
                          <div
                            key={`${player.name}-${player.suspectId}-${index}`}
                            className={`game-turn-item ${isActive ? "game-turn-item-active" : ""}`}
                            style={{ "--turn-color": color } as React.CSSProperties}
                          >
                            <span className="game-turn-indicator" style={{ backgroundColor: color }} />
                            <div className="game-turn-info">
                              <span className="game-turn-name">{player.name}</span>
                              <span className="game-turn-suspect">{player.suspectName}</span>
                            </div>
                            <span className="game-turn-badge">
                              {isActive ? "Now" : `#${index + 1}`}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </section>
            </div>

            {/* Right Column: Timeline */}
            <div className="game-active-right">
              <section className="game-panel game-panel-timeline">
                <div className="game-panel-header">
                  <div className="game-panel-header-icon">
                    <Clock className="w-4 h-4" />
                  </div>
                  <h3 className="game-panel-title">Investigation Timeline</h3>
                </div>
                <div className="game-panel-body">
                  <GameHistory gameId={gameId} maxItems={6} compact />
                </div>
              </section>
            </div>
          </div>
        </main>
      )}

      {/* Solved */}
      {isSolved && game.solution && (
        <main className="game-solved">
          <div className="game-solved-inner">
            {/* Victory Header */}
            <div className="game-solved-header">
              <div className="game-solved-header-deco">
                <span className="game-solved-header-deco-line" />
                <span className="game-solved-header-deco-diamond" />
                <span className="game-solved-header-deco-line" />
              </div>
              <h2 className="game-solved-title">Case Closed</h2>
              <p className="game-solved-subtitle">The mystery has been unraveled.</p>
            </div>

            {/* Solution Reveal Cards */}
            <div className="game-solved-cards">
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
              <div className="game-solved-narrative">
                <div className="game-solved-narrative-icon">
                  <BookOpen className="w-5 h-5" />
                </div>
                <p className="game-solved-narrative-text">{game.narrative.closing}</p>
              </div>
            )}

            {/* Return Button */}
            <div className="game-solved-actions">
              <button className="game-solved-return-btn" onClick={() => onNavigate("/")}>
                <ArrowLeft className="w-4 h-4" />
                Return to Case Files
              </button>
            </div>
          </div>
        </main>
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

      {/* Secret Passage Modal */}
      {secretPassageResult && (
        <div className="game-modal-overlay">
          <div className="game-modal">
            <div className="game-modal-header">
              <div className="game-modal-icon">
                <DoorOpen className="w-6 h-6" />
              </div>
              <h3 className="game-modal-title">Secret Passage</h3>
              <p className="game-modal-subtitle">
                {secretPassageResult.outcome === "good" && "Fortune favors you."}
                {secretPassageResult.outcome === "neutral" && "You pass unseen."}
                {secretPassageResult.outcome === "bad" && "A complication arises."}
              </p>
            </div>
            <div className="game-modal-body">
              <p className="game-modal-text">{secretPassageResult.description}</p>
              <p className="game-modal-hint">Your turn continues.</p>
            </div>
            <div className="game-modal-footer">
              {pendingPhoneContinue === "use_secret_passage" ? (
                <p className="game-modal-waiting">Waiting for the detective to continue from their phone.</p>
              ) : (
                <button className="game-modal-btn" onClick={closeSecretPassage}>Continue</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Interruption Intro Modal */}
      {showInterruptionIntro && (
        <div className="game-modal-overlay">
          <div className="game-modal game-modal-lg">
            <div className="game-modal-header">
              <div className="game-modal-icon game-modal-icon-alert">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="game-modal-title">Inspector Interruption</h3>
              <p className="game-modal-subtitle">{interruptionIntroText}</p>
            </div>
            <div className="game-modal-body">
              <img
                src="/images/ui/Inspector screen.png"
                alt="Inspector screen"
                className="game-modal-image"
              />
            </div>
            <div className="game-modal-footer">
              <button className="game-modal-btn" onClick={acknowledgeInterruptionIntro}>OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Interruption Main Modal */}
      {showInterruption && (
        <div className="game-modal-overlay">
          <div className="game-modal game-modal-lg">
            <div className="game-modal-header">
              <div className="game-modal-icon game-modal-icon-alert">
                <Bell className="w-6 h-6" />
              </div>
              <h3 className="game-modal-title">Inspector Interruption</h3>
              <p className="game-modal-subtitle">Inspector Brown has an instruction for the table.</p>
            </div>
            <div className="game-modal-body">
              <p className="game-modal-text">{interruptionMessage || interruptionFallbackText}</p>
              <img
                src={inspectorInterruptionImages[inspectorImageIndex]}
                alt="Inspector Brown"
                className="game-modal-image"
              />
            </div>
            <div className="game-modal-footer">
              <button className="game-modal-btn" onClick={closeInterruption}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Clue Reveal Modal */}
      {showClueReveal && latestClue && (
        <div className="game-modal-overlay">
          <div className="game-modal game-modal-lg">
            <div className="game-modal-header">
              <div className="game-modal-icon">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="game-modal-title">New Clue Discovered</h3>
              <p className="game-modal-subtitle">A fresh lead has emerged in the investigation.</p>
            </div>
            <div className="game-modal-body">
              <img
                src={butlerClueImages[butlerImageIndex]}
                alt="Butler"
                className="game-modal-image"
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
            </div>
            <div className="game-modal-footer">
              <button className="game-modal-btn" onClick={() => setShowClueReveal(false)}>Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Inspector Notes Modal */}
      {showInspectorNotes && (
        <div className="game-modal-overlay">
          <div className="game-modal">
            <div className="game-modal-header">
              <div className="game-modal-icon">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="game-modal-title">Inspector's Notes</h3>
              <p className="game-modal-subtitle">Select a note to read. Only the current player should view the contents.</p>
            </div>
            <div className="game-modal-body">
              {!showLookAway && !revealedInspectorNote && (
                <div className="game-modal-notes-grid">
                  <button
                    className="game-modal-note-btn"
                    disabled={!canReadNote1}
                    onClick={() => handleSelectInspectorNote("N1")}
                  >
                    <span className="game-modal-note-label">Note 1</span>
                    <span className="game-modal-note-status">{note1Status}</span>
                  </button>
                  <button
                    className="game-modal-note-btn"
                    disabled={!canReadNote2}
                    onClick={() => handleSelectInspectorNote("N2")}
                  >
                    <span className="game-modal-note-label">Note 2</span>
                    <span className="game-modal-note-status">{note2Status}</span>
                  </button>
                </div>
              )}

              {showLookAway && !revealedInspectorNote && (
                <div className="game-modal-lookaway">
                  <p className="game-modal-lookaway-text">Other players should look away now.</p>
                  <button className="game-modal-btn" onClick={handleRevealInspectorNote}>Reveal Note</button>
                </div>
              )}

              {revealedInspectorNote && (
                <div className="game-modal-revealed">
                  <span className="game-modal-revealed-label">
                    Confidential {revealedNoteId ? `(${revealedNoteId})` : ""}
                  </span>
                  <p className="game-modal-revealed-text">{revealedInspectorNote}</p>
                </div>
              )}
            </div>
            <div className="game-modal-footer game-modal-footer-split">
              <button className="game-modal-btn game-modal-btn-outline" onClick={closeInspectorNotes}>Close</button>
              {revealedInspectorNote && (
                <span className="game-modal-hint">
                  {noteWasFirstRead ? "This ends your turn." : "You may continue your turn."}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Make Suggestion Modal */}
      {showEndTurnConfirm && (
        <div className="game-modal-overlay">
          <div className="game-modal">
            <div className="game-modal-header">
              <div className="game-modal-icon">
                <MessageCircle className="w-6 h-6" />
              </div>
              <h3 className="game-modal-title">Make Suggestion</h3>
              <p className="game-modal-subtitle">Announce your suggestion to the table. Once resolved, click Confirm to end your turn.</p>
            </div>
            <div className="game-modal-footer">
              {pendingPhoneContinue === "make_suggestion" ? (
                <p className="game-modal-waiting">Waiting for the detective to continue from their phone.</p>
              ) : (
                <>
                  <button className="game-modal-btn game-modal-btn-outline" onClick={() => setShowEndTurnConfirm(false)}>Cancel</button>
                  <button className="game-modal-btn" onClick={handleEndTurn}>Confirm Suggestion</button>
                </>
              )}
            </div>
          </div>
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
