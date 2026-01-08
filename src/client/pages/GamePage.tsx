import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Search, Gavel, CheckCircle, Users, Sparkles, Clock, BookOpen } from "lucide-react";
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
  // Local state for player's elimination tracking (not persisted to server)
  const [playerMarks, setPlayerMarks] = useState<EliminationState>(emptyEliminated);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="mb-1">{game.theme?.name || "Mystery"}</h2>
              <p className="text-muted-foreground">
                {game.theme?.description || "A theft has occurred at Tudor Mansion"}
              </p>
            </div>
            <Badge variant={getStatusVariant(game.status) as "setup" | "in-progress" | "solved" | "abandoned"}>
              {game.status.replace("_", " ")}
            </Badge>
          </div>

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
    </div>
  );
}
