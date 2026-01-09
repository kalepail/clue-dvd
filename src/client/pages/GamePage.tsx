import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Search, Gavel, CheckCircle, Users, Sparkles, Clock, BookOpen, DoorOpen, Bell } from "lucide-react";
import { gameStore, type GameDataFormatted } from "../hooks/useGameStore";
import ClueDisplay from "../components/ClueDisplay";
import AccusationPanel from "../components/AccusationPanel";
import EliminationTracker from "../components/EliminationTracker";
import GameHistory from "../components/GameHistory";
import SolutionCards from "../components/SolutionCards";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/client/components/ui/card";
import { Badge } from "@/client/components/ui/badge";
import { Progress } from "@/client/components/ui/progress";
import { IconStat } from "@/client/components/ui/icon-stat";
import type { EliminationState } from "../../shared/api-types";
import { getLocationName } from "../../shared/game-elements";

interface Props {
  gameId: string;
  onNavigate: (path: string) => void;
}

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
  const [showAccusation, setShowAccusation] = useState(false);
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
  const pauseStartRef = useRef<number | null>(null);
  const pauseAccumulatedRef = useRef(0);
  const [showInspectorNotes, setShowInspectorNotes] = useState(false);
  const [selectedInspectorNote, setSelectedInspectorNote] = useState<string | null>(null);
  const [showLookAway, setShowLookAway] = useState(false);
  const [revealedInspectorNote, setRevealedInspectorNote] = useState<string | null>(null);
  const [revealedNoteId, setRevealedNoteId] = useState<string | null>(null);
  const [noteWasFirstRead, setNoteWasFirstRead] = useState(false);
  // Local state for player's elimination tracking (not persisted to server)
  const [playerMarks, setPlayerMarks] = useState<EliminationState>(emptyEliminated);
  const [turnAnnouncement, setTurnAnnouncement] = useState<string | null>(null);
  const [showTurnAnnouncement, setShowTurnAnnouncement] = useState(false);
  const previousTurnKey = useRef<string | null>(null);
  const gameProgress = game?.totalClues ? game.currentClueIndex / game.totalClues : 0;

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
    if (!game?.startedAt || game.status !== "in_progress") return;
    const startMs = new Date(game.startedAt).getTime();
    const tick = () => {
      const diffMs = Date.now() - startMs - pauseAccumulatedRef.current;
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
    setTurnAnnouncement(`${game.currentTurn.suspectName}'s turn`);
    setShowTurnAnnouncement(true);
    const timer = window.setTimeout(() => setShowTurnAnnouncement(false), 1600);
    return () => window.clearTimeout(timer);
  }, [game?.currentTurn, game?.currentTurnIndex]);

  const handleStartGame = () => {
    try {
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
  }): Promise<{ correct: boolean; message: string; aiResponse?: string }> => {
    try {
      const result = gameStore.makeAccusation(gameId, {
        player: "Detective",
        ...accusation,
      });
      loadGame();
      setShowAccusation(false);
      return {
        correct: result.correct,
        message: result.message,
      };
    } catch {
      return { correct: false, message: "Failed to make accusation" };
    }
  };

  const handleSecretPassage = () => {
    try {
      const result = gameStore.useSecretPassage(gameId);
      setSecretPassageResult(result);
      loadGame();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to use secret passage");
    }
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
  };

  const acknowledgeInterruptionIntro = () => {
    setShowInterruptionIntro(false);
    setShowInterruption(true);
  };

  const closeInterruption = () => {
    setShowInterruption(false);
  };

  const handleToggleMark = (
    category: "suspect" | "item" | "location" | "time",
    elementId: string
  ) => {
    // Pure local state - no server persistence needed
    const categoryKey = `${category}s` as keyof EliminationState;
    const currentList = playerMarks[categoryKey];
    const isCurrentlyMarked = currentList.includes(elementId);
    const newList = isCurrentlyMarked
      ? currentList.filter((id) => id !== elementId)
      : [...currentList, elementId];

    setPlayerMarks({
      ...playerMarks,
      [categoryKey]: newList,
    });
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
  const note1Available = gameProgress >= 0.5;
  const note2Available = gameProgress >= 0.65;
  const currentReaderId = game.currentTurn?.suspectId || "unknown";
  const readByCurrentPlayer = game.readInspectorNotes[currentReaderId] || [];
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
      {turnAnnouncement && (
        <div className={`turn-toast ${showTurnAnnouncement ? "turn-toast-show" : ""}`}>
          {turnAnnouncement}
        </div>
      )}
      {/* Header */}
      <Card>
        <CardContent>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="mb-1">{game.theme?.name || "Mystery"}</h2>
              <p className="text-muted-foreground">
                {game.theme?.description || "A theft has occurred at Tudor Mansion"}
              </p>
              {game.currentTurn && (
                <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-primary/60 bg-secondary/70 px-4 py-2">
                  <span className="text-xs uppercase tracking-widest text-muted-foreground">
                    Current Turn
                  </span>
                  <span className="text-lg text-primary font-semibold">
                    {game.currentTurn.suspectName}
                  </span>
                </div>
              )}
            </div>
            <Badge variant={getStatusVariant(game.status) as "setup" | "in-progress" | "solved" | "abandoned"}>
              {game.status.replace("_", " ")}
            </Badge>
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
              <SolutionCards solution={game.solution} />
            )}

            <Button size="lg" onClick={handleStartGame}>
              <Search className="mr-2 h-5 w-5" />
              Begin Investigation
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Active Game */}
      {isInProgress && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            {/* Latest Clue */}
            {latestClue && (
              <Card className="border-primary">
                <CardHeader>
                  <CardTitle className="text-lg">Latest Clue</CardTitle>
                </CardHeader>
                <CardContent>
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
              </Card>
            )}

            {/* Controls */}
            <Card>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={handleRevealClue}
                    disabled={revealingClue || cluesRemaining === 0}
                  >
                    {revealingClue ? (
                      <>
                        <div className="loading-spinner mr-2" />
                        Revealing...
                      </>
                    ) : (
                      <>
                        <Search className="mr-2 h-4 w-4" />
                        Reveal Next Clue
                      </>
                    )}
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => setShowAccusation(true)}
                  >
                    <Gavel className="mr-2 h-4 w-4" />
                    Make Accusation
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSecretPassage}
                  >
                    <DoorOpen className="mr-2 h-4 w-4" />
                    Use Secret Passage
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleOpenInspectorNotes}
                    disabled={!hasInspectorNoteAvailable}
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    Read Inspector Note
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowNarrative(!showNarrative)}
                  >
                    <BookOpen className="mr-2 h-4 w-4" />
                    {showNarrative ? "Hide" : "Show"} Story
                  </Button>
                </div>

                {game.wrongAccusations > 0 && (
                  <p className="text-destructive text-sm mt-4">
                    Wrong accusations: {game.wrongAccusations}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Narrative Panel */}
            {showNarrative && game.narrative && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">The Story So Far</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {game.narrative.setting && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">Setting</h4>
                      <p className="text-sm italic">{game.narrative.setting}</p>
                    </div>
                  )}
                  {game.narrative.atmosphere && (
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-1">Atmosphere</h4>
                      <p className="text-sm italic">{game.narrative.atmosphere}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Investigation Timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Investigation Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <GameHistory gameId={gameId} />
              </CardContent>
            </Card>
          </div>

          {/* Elimination Tracker - player's local tracking */}
          <div>
            <EliminationTracker eliminated={playerMarks} onToggle={handleToggleMark} />
          </div>
        </div>
      )}

      {/* Solved */}
      {isSolved && game.solution && (
        <Card className="border-success text-center">
          <CardHeader>
            <CardTitle className="text-success flex items-center justify-center gap-2">
              <CheckCircle className="h-6 w-6" />
              Case Solved!
            </CardTitle>
            <CardDescription className="text-base">
              The mystery has been unraveled. The truth is revealed:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-4 text-lg max-w-md mx-auto">
              <div className="text-right text-muted-foreground">Who:</div>
              <div className="text-left font-semibold">{game.solution.suspectName}</div>
              <div className="text-right text-muted-foreground">What:</div>
              <div className="text-left font-semibold">{game.solution.itemName}</div>
              <div className="text-right text-muted-foreground">Where:</div>
              <div className="text-left font-semibold">{game.solution.locationName}</div>
              <div className="text-right text-muted-foreground">When:</div>
              <div className="text-left font-semibold">{game.solution.timeName}</div>
            </div>

            {/* Closing Narrative */}
            {game.narrative?.closing && (
              <div className="bg-muted/50 rounded-lg p-4 text-left max-w-2xl mx-auto">
                <p className="italic text-muted-foreground">{game.narrative.closing}</p>
              </div>
            )}

            {/* Solution Cards with Magnifying Glass Effect */}
            <SolutionCards solution={game.solution} />

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
          eliminated={playerMarks}
          onClose={() => setShowAccusation(false)}
          onAccuse={handleAccusation}
        />
      )}

      {secretPassageResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DoorOpen className="h-5 w-5 text-primary" />
                Secret Passage
              </CardTitle>
              <CardDescription>
                {secretPassageResult.outcome === "good" && "Fortune favors you."}
                {secretPassageResult.outcome === "neutral" && "You pass unseen."}
                {secretPassageResult.outcome === "bad" && "A complication arises."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm italic">{secretPassageResult.description}</p>
              <div className="text-sm text-muted-foreground">
                Your turn continues.
              </div>
            </CardContent>
            <CardContent className="pt-0">
              <Button onClick={closeSecretPassage}>Continue</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showInterruptionIntro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5 text-primary" />
                Inspector Interruption
              </CardTitle>
              <CardDescription>
                Inspector Brown would like to see you.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <Button onClick={acknowledgeInterruptionIntro}>OK</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showInterruption && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <Card className="max-w-lg w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bell className="h-5 w-5 text-primary" />
                Inspector Interruption
              </CardTitle>
              <CardDescription>
                Inspector Brown has an instruction for the table.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm italic">
                {interruptionMessage || "Inspector Brown calls for an immediate pause in the investigation."}
              </p>
            </CardContent>
            <CardContent className="pt-0">
              <Button onClick={closeInterruption}>Continue</Button>
            </CardContent>
          </Card>
        </div>
      )}

      {showInspectorNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <Card className="max-w-xl w-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="h-5 w-5 text-primary" />
                Inspector's Notes
              </CardTitle>
              <CardDescription>
                Select a note to read. Only the current player should view the contents.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  <p className="text-sm text-muted-foreground">
                    Other players should look away now.
                  </p>
                  <Button onClick={handleRevealInspectorNote}>
                    Reveal Note
                  </Button>
                </div>
              )}

              {revealedInspectorNote && (
                <div className="rounded-lg border border-primary/40 bg-secondary/40 p-4 space-y-3">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Confidential {revealedNoteId ? `(${revealedNoteId})` : ""}
                  </div>
                  <p className="text-sm italic">{revealedInspectorNote}</p>
                </div>
              )}
            </CardContent>
            <CardContent className="pt-0 flex justify-between items-center">
              <Button variant="outline" onClick={closeInspectorNotes}>
                Close
              </Button>
              {revealedInspectorNote && (
                <span className="text-sm text-muted-foreground">
                  {noteWasFirstRead ? "This ends your turn." : "You may continue your turn."}
                </span>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
