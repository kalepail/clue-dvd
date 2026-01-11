import { useState, useEffect } from "react";
import { Plus, Users, Clock, Sparkles, Trash2 } from "lucide-react";
import { gameStore, type LocalGameListItem } from "../hooks/useGameStore";
import NewGameModal from "../components/NewGameModal";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Badge } from "@/client/components/ui/badge";
import { IconStat } from "@/client/components/ui/icon-stat";

interface Props {
  onNavigate: (path: string) => void;
}

export default function HomePage({ onNavigate }: Props) {
  const [games, setGames] = useState<LocalGameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewGame, setShowNewGame] = useState(false);

  const loadGames = () => {
    setLoading(true);
    try {
      const gameList = gameStore.listGames();
      setGames(gameList);
    } catch (err) {
      console.error("Failed to load games:", err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadGames();
  }, []);


  const handleGameCreated = (gameId: string) => {
    setShowNewGame(false);
    loadGames(); // Refresh the list
    onNavigate(`/game/${gameId}`);
  };

  const handleDeleteGame = (e: React.MouseEvent, gameId: string) => {
    e.stopPropagation(); // Prevent navigating to the game
    if (window.confirm("Are you sure you want to delete this investigation?")) {
      gameStore.deleteGame(gameId);
      loadGames();
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case "setup":
        return "setup";
      case "in_progress":
        return "in-progress";
      case "solved":
        return "solved";
      case "abandoned":
        return "abandoned";
      default:
        return "secondary";
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };


  return (
    <div>
      <div className="flex justify-between items-center gap-6 mb-6">
        <h2>Your Investigations</h2>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => onNavigate("/host-lobby")}>
            Start Phone Lobby
          </Button>
          <Button onClick={() => setShowNewGame(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Game
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">
          <div className="loading-spinner mx-auto mb-4" />
          Loading investigations...
        </div>
      ) : games.length === 0 ? (
        <Card className="text-center p-8">
          <CardHeader>
            <CardTitle>No Investigations Yet</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Begin your first mystery at Tudor Mansion
            </p>
            <Button onClick={() => setShowNewGame(true)}>
              <Sparkles className="mr-2 h-4 w-4" />
              Start New Investigation
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {games.map((game) => (
            <Card
              key={game.id}
              className="cursor-pointer hover:border-primary transition-colors group relative"
              onClick={() => onNavigate(`/game/${game.id}`)}
            >
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-3">
                  <Badge variant={getStatusVariant(game.status) as "setup" | "in-progress" | "solved" | "abandoned"}>
                    {game.status.replace("_", " ")}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(game.createdAt)}
                    </span>
                    <button
                      onClick={(e) => handleDeleteGame(e, game.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-destructive/10 rounded"
                      title="Delete game"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </button>
                  </div>
                </div>
                <h3 className="text-base mb-3">
                  {game.theme?.name || "Mystery"}
                </h3>
                <div className="space-y-1">
                  <IconStat icon={Sparkles} className="capitalize">{game.difficulty}</IconStat>
                  <IconStat icon={Users}>{game.playerCount} Players</IconStat>
                  <IconStat icon={Clock}>{game.cluesRevealed}/{game.totalClues} Clues</IconStat>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showNewGame && (
        <NewGameModal
          onClose={() => setShowNewGame(false)}
          onCreated={handleGameCreated}
        />
      )}
    </div>
  );
}
