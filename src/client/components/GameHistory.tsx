import { useState, useEffect } from "react";
import {
  Play,
  HelpCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Sparkles,
  MessageCircle,
  Clock,
  Eye,
  Skull,
  Trophy,
  Flag,
  StickyNote,
  Users,
} from "lucide-react";
import { gameStore } from "../hooks/useGameStore";
import type { GameAction } from "../../shared/api-types";
import { cn } from "@/client/lib/utils";
import { Badge } from "@/client/components/ui/badge";

interface Props {
  gameId: string;
}

export default function GameHistory({ gameId }: Props) {
  const [actions, setActions] = useState<GameAction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = () => {
      setLoading(true);
      try {
        const history = gameStore.getHistory(gameId);
        setActions(history);
      } catch (err) {
        console.error("Failed to load history:", err);
      }
      setLoading(false);
    };
    loadHistory();
  }, [gameId]);

  if (loading) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <div className="loading-spinner mx-auto mb-3" />
        <p className="text-sm">Loading timeline...</p>
      </div>
    );
  }

  if (actions.length === 0) {
    return (
      <div className="text-muted-foreground py-8 text-center">
        <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">No events yet</p>
        <p className="text-xs mt-1 opacity-70">
          Events will appear as the investigation unfolds
        </p>
      </div>
    );
  }

  // Reverse order: most recent first
  const reversedActions = [...actions].reverse();

  const getActionConfig = (type: string) => {
    switch (type) {
      case "game_started":
        return {
          icon: <Play className="h-4 w-4" />,
          color: "text-primary",
          bgColor: "bg-primary/10",
          borderColor: "border-primary/40",
          label: "Investigation Begins",
        };
      case "clue_revealed":
        return {
          icon: <MessageCircle className="h-4 w-4" />,
          color: "text-blue-400",
          bgColor: "bg-blue-500/10",
          borderColor: "border-blue-500/40",
          label: "Clue Revealed",
        };
      case "accusation_made":
        return {
          icon: <AlertTriangle className="h-4 w-4" />,
          color: "text-yellow-500",
          bgColor: "bg-yellow-500/10",
          borderColor: "border-yellow-500/40",
          label: "Accusation Made",
        };
      case "accusation_correct":
        return {
          icon: <Trophy className="h-4 w-4" />,
          color: "text-success",
          bgColor: "bg-success/10",
          borderColor: "border-success/40",
          label: "Case Solved!",
        };
      case "accusation_wrong":
        return {
          icon: <XCircle className="h-4 w-4" />,
          color: "text-destructive",
          bgColor: "bg-destructive/10",
          borderColor: "border-destructive/40",
          label: "Wrong Accusation",
        };
      case "card_shown":
        return {
          icon: <Eye className="h-4 w-4" />,
          color: "text-purple-400",
          bgColor: "bg-purple-500/10",
          borderColor: "border-purple-500/40",
          label: "Card Shown",
        };
      case "player_eliminated":
        return {
          icon: <Skull className="h-4 w-4" />,
          color: "text-gray-400",
          bgColor: "bg-gray-500/10",
          borderColor: "border-gray-500/40",
          label: "Player Eliminated",
        };
      case "game_won":
        return {
          icon: <CheckCircle className="h-4 w-4" />,
          color: "text-success",
          bgColor: "bg-success/10",
          borderColor: "border-success/40",
          label: "Victory!",
        };
      case "game_abandoned":
        return {
          icon: <Flag className="h-4 w-4" />,
          color: "text-muted-foreground",
          bgColor: "bg-muted/50",
          borderColor: "border-muted",
          label: "Abandoned",
        };
      case "dramatic_event":
        return {
          icon: <Sparkles className="h-4 w-4" />,
          color: "text-purple-400",
          bgColor: "bg-purple-500/10",
          borderColor: "border-purple-500/40",
          label: "Dramatic Event",
        };
      case "note_taken":
        return {
          icon: <StickyNote className="h-4 w-4" />,
          color: "text-amber-400",
          bgColor: "bg-amber-500/10",
          borderColor: "border-amber-500/40",
          label: "Note Taken",
        };
      default:
        return {
          icon: <HelpCircle className="h-4 w-4" />,
          color: "text-muted-foreground",
          bgColor: "bg-muted/50",
          borderColor: "border-muted",
          label: type.replace(/_/g, " "),
        };
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDetails = (
    action: GameAction
  ): { text?: string; meta?: { label: string; value: string }[] } => {
    const details = action.details;
    if (!details || Object.keys(details).length === 0)
      return { text: undefined, meta: undefined };

    // For game started, format player info nicely
    if (action.actionType === "game_started") {
      const meta: { label: string; value: string }[] = [];
      if (details.playerNames) {
        const names = Array.isArray(details.playerNames)
          ? details.playerNames.join(", ")
          : String(details.playerNames);
        meta.push({ label: "Players", value: names });
      }
      return { text: undefined, meta };
    }

    // For clue reveals, show the clue text prominently
    // Speaker is already shown in the header via action.actor, so no need to duplicate
    if (action.actionType === "clue_revealed" && details.clueText) {
      return { text: String(details.clueText), meta: undefined };
    }

    // For accusations, format nicely
    if (
      action.actionType === "accusation_made" ||
      action.actionType === "accusation_correct" ||
      action.actionType === "accusation_wrong"
    ) {
      const parts: string[] = [];
      if (details.suspectName) parts.push(String(details.suspectName));
      if (details.itemName) parts.push(`with the ${details.itemName}`);
      if (details.locationName) parts.push(`in the ${details.locationName}`);
      if (details.timeName) parts.push(`at ${details.timeName}`);
      return { text: parts.join(" "), meta: undefined };
    }

    // For dramatic events
    if (action.actionType === "dramatic_event" && details.description) {
      return { text: String(details.description), meta: undefined };
    }

    // For notes
    if (action.actionType === "note_taken" && details.content) {
      return { text: String(details.content), meta: undefined };
    }

    // Generic fallback
    if (typeof details === "string") return { text: details, meta: undefined };

    const meta: { label: string; value: string }[] = [];
    Object.entries(details).forEach(([key, value]) => {
      if (value && key !== "clueText" && key !== "description") {
        const label = key
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (str) => str.toUpperCase())
          .trim();
        meta.push({ label, value: String(value) });
      }
    });

    return { text: undefined, meta: meta.length > 0 ? meta : undefined };
  };

  return (
    <div className="max-h-[500px] overflow-auto">
      {/* Timeline container - pl-4 ensures nodes don't clip the card edge */}
      <div className="relative pl-4 pt-2">
        {/* Vertical timeline line - centered on 24px nodes (pl-4=16px + node-center=12px - half-line=1px = 27px) */}
        <div className="absolute left-[27px] top-5 bottom-8 w-0.5 bg-gradient-to-b from-primary/60 via-border to-border/20 rounded-full" />

        {reversedActions.map((action, index) => {
          const config = getActionConfig(action.actionType);
          const { text, meta } = formatDetails(action);
          const isFirst = index === 0;

          return (
            <div
              key={action.sequenceNumber}
              className="relative pl-8 pb-5"
            >
              {/* Timeline node - z-10 to sit above line, solid bg-card (no transparent bgColor) */}
              <div
                className={cn(
                  "absolute left-0 z-10 w-6 h-6 rounded-full border-2 grid place-items-center transition-all bg-card [&>svg]:h-3 [&>svg]:w-3",
                  config.borderColor,
                  config.color,
                  isFirst && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
                )}
              >
                {config.icon}
              </div>

              {/* Event card */}
              <div
                className={cn(
                  "rounded-lg border p-4 transition-all",
                  config.bgColor,
                  config.borderColor,
                  "hover:shadow-lg hover:border-opacity-60"
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-xs font-semibold px-2.5 py-0.5",
                        config.color,
                        config.borderColor
                      )}
                    >
                      {config.label}
                    </Badge>
                    {action.actor && action.actor !== "system" && (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {action.actor}
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground flex items-center gap-1.5 shrink-0">
                    <Clock className="h-3.5 w-3.5" />
                    {formatTime(action.createdAt)}
                  </span>
                </div>

                {/* Content - quote style for clue text */}
                {text && (
                  <blockquote
                    className={cn(
                      "border-l-2 pl-4 italic",
                      config.borderColor,
                      "text-foreground"
                    )}
                  >
                    "{text}"
                  </blockquote>
                )}

                {/* Meta info - displayed as clean list */}
                {meta && meta.length > 0 && (
                  <div className={cn("space-y-1.5", text && "mt-3")}>
                    {meta.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <span className="text-muted-foreground">{item.label}:</span>
                        <span className="text-foreground font-medium">{item.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Event number footer */}
                <div className="mt-3 pt-2 border-t border-border/30">
                  <span className="text-xs text-muted-foreground">
                    Event #{action.sequenceNumber}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {/* Timeline end marker */}
        <div className="relative pl-8 pt-1">
          <div className="absolute left-0 z-10 w-6 h-6 rounded-full bg-card border-2 border-border grid place-items-center">
            <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground italic py-1">
            Start of investigation
          </p>
        </div>
      </div>
    </div>
  );
}
