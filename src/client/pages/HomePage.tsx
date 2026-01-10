import { useState, useEffect } from "react";
import { Plus, Users, Clock, Sparkles, Trash2 } from "lucide-react";
import { gameStore, type LocalGameListItem } from "../hooks/useGameStore";
import NewGameModal from "../components/NewGameModal";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/client/components/ui/card";
import { Badge } from "@/client/components/ui/badge";
import { IconStat } from "@/client/components/ui/icon-stat";
import { closeSession, createSession, getSession, getSessionEvents } from "../phone/api";
import {
  clearHostSessionCode,
  consumeHostAutoCreate,
  loadHostSessionCode,
  storeHostSessionCode,
} from "../phone/storage";
import type { PhoneSessionSummary } from "../../phone/types";

interface Props {
  onNavigate: (path: string) => void;
}

export default function HomePage({ onNavigate }: Props) {
  const [games, setGames] = useState<LocalGameListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewGame, setShowNewGame] = useState(false);
  const [phoneSession, setPhoneSession] = useState<PhoneSessionSummary | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [lastEventId, setLastEventId] = useState<number | null>(null);

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

  useEffect(() => {
    if (phoneSession) return;
    const existingCode = loadHostSessionCode();
    if (!existingCode) return;
    getSession(existingCode)
      .then((session) => {
        setPhoneSession(session);
      })
      .catch(() => undefined);
  }, [phoneSession]);

  useEffect(() => {
    if (phoneSession) return;
    if (!consumeHostAutoCreate()) return;
    handlePhoneLobby();
  }, [phoneSession]);

  useEffect(() => {
    if (!phoneSession) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await getSession(phoneSession.session.code);
        setPhoneSession(data);
      } catch {
        // Keep last known roster if polling fails.
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [phoneSession?.session.code]);

  useEffect(() => {
    if (!phoneSession) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await getSessionEvents(phoneSession.session.code, lastEventId ?? undefined);
        if (data.events.length === 0) return;
        for (const event of data.events) {
          setLastEventId(event.id);
          if (event.type === "turn_action" && event.payload.action === "start_game") {
            const themeId = typeof event.payload.themeId === "string" && event.payload.themeId.length > 0
              ? event.payload.themeId
              : undefined;
            const difficulty =
              typeof event.payload.difficulty === "string" ? event.payload.difficulty : "intermediate";
            const players = phoneSession.players.map((player) => ({
              name: player.name,
              suspectId: player.suspectId,
            }));
            if (players.length === 0) {
              setPhoneError("No players joined the phone lobby yet.");
              continue;
            }
            const game = await gameStore.createGame({
              themeId,
              difficulty: difficulty as "beginner" | "intermediate" | "expert",
              playerCount: players.length,
              players,
              useAI: false,
            });
            gameStore.startGame(game.id, players.map((player) => player.name));
            onNavigate(`/game/${game.id}`);
            return;
          }
        }
      } catch (err) {
        setPhoneError(err instanceof Error ? err.message : "Failed to fetch phone events");
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [phoneSession, lastEventId, onNavigate]);

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

  const handlePhoneLobby = async () => {
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      const session = await createSession();
      storeHostSessionCode(session.session.code);
      setPhoneSession(session);
      setLastEventId(null);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Failed to create phone lobby");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleClosePhoneLobby = async () => {
    if (!phoneSession) return;
    setPhoneLoading(true);
    setPhoneError(null);
    try {
      await closeSession(phoneSession.session.code);
      clearHostSessionCode();
      setPhoneSession(null);
      setLastEventId(null);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Failed to close phone lobby");
    } finally {
      setPhoneLoading(false);
    }
  };

  const sortedPhonePlayers = phoneSession
    ? [...phoneSession.players].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    : [];

  return (
    <div>
      <div className="flex justify-between items-center gap-6 mb-6">
        <h2>Your Investigations</h2>
        <Button onClick={() => setShowNewGame(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Game
        </Button>
      </div>

      <Card className="mb-8 border-primary/40">
        <CardHeader>
          <CardTitle>Phone Lobby</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!phoneSession ? (
            <div className="flex flex-col gap-3">
              <p className="text-muted-foreground">
                Start a phone lobby to let players join from their devices.
              </p>
              <Button onClick={handlePhoneLobby} disabled={phoneLoading}>
                {phoneLoading ? "Creating Lobby..." : "Start Phone Lobby"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <Badge variant="setup">Join Code: {phoneSession.session.code}</Badge>
                <span className="text-sm text-muted-foreground">
                  Players visit <strong>#/phone</strong> to join.
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleClosePhoneLobby} disabled={phoneLoading}>
                  End Phone Session
                </Button>
              </div>
              <div className="space-y-2">
                <div className="text-sm text-muted-foreground">Roster</div>
                {sortedPhonePlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Waiting for players...</p>
                ) : (
                  <div className="grid gap-2">
                    {sortedPhonePlayers.map((player, index) => (
                      <div key={player.id} className="flex justify-between text-sm">
                        <span>{player.name}</span>
                        <span className="text-muted-foreground">
                          {player.suspectId}
                          {index === 0 ? " · Lead" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Waiting for the lead detective to start the game from their phone.
              </p>
              {phoneError && <p className="text-sm text-destructive">{phoneError}</p>}
            </div>
          )}
        </CardContent>
      </Card>

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
