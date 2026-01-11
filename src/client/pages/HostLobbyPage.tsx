import { useEffect, useState } from "react";
import { Users, QrCode, DoorOpen } from "lucide-react";
import { gameStore } from "../hooks/useGameStore";
import { createSession, getSession, getSessionEvents, closeSession } from "../phone/api";
import type { PhoneSessionSummary } from "../../phone/types";
import {
  clearHostSessionCode,
  consumeHostAutoCreate,
  loadHostSessionCode,
  storeHostSessionCode,
} from "../phone/storage";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/client/components/ui/card";
import { Badge } from "@/client/components/ui/badge";

interface Props {
  onNavigate: (path: string) => void;
}

export default function HostLobbyPage({ onNavigate }: Props) {
  const [session, setSession] = useState<PhoneSessionSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastEventId, setLastEventId] = useState<number | null>(null);

  const loadExisting = async (code: string) => {
    try {
      const data = await getSession(code);
      setSession(data);
    } catch {
      clearHostSessionCode();
    }
  };

  useEffect(() => {
    if (session) return;
    const storedCode = loadHostSessionCode();
    if (storedCode) {
      loadExisting(storedCode);
      return;
    }
    if (consumeHostAutoCreate()) {
      handleCreateLobby();
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await getSession(session.session.code);
        setSession(data);
      } catch {
        // Keep last known roster if polling fails.
      }
    }, 2000);
    return () => window.clearInterval(interval);
  }, [session?.session.code]);

  useEffect(() => {
    if (!session) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await getSessionEvents(session.session.code, lastEventId ?? undefined);
        if (data.events.length === 0) return;
        for (const event of data.events) {
          setLastEventId(event.id);
          if (event.type === "turn_action" && event.payload.action === "start_game") {
            const themeId = typeof event.payload.themeId === "string" && event.payload.themeId.length > 0
              ? event.payload.themeId
              : undefined;
            const difficulty =
              typeof event.payload.difficulty === "string" ? event.payload.difficulty : "intermediate";
            const players = session.players.map((player) => ({
              name: player.name,
              suspectId: player.suspectId,
            }));
            if (players.length === 0) {
              setError("No players joined the phone lobby yet.");
              continue;
            }
            const game = await gameStore.createGame({
              themeId,
              difficulty: difficulty as "beginner" | "intermediate" | "expert",
              playerCount: players.length,
              players,
              useAI: false,
            });
            onNavigate(`/game/${game.id}`);
            return;
          }
        }
      } catch {
        // Ignore polling errors to keep the lobby stable.
      }
    }, 1500);
    return () => window.clearInterval(interval);
  }, [session, lastEventId, onNavigate]);

  const handleCreateLobby = async () => {
    setLoading(true);
    setError(null);
    try {
      const created = await createSession();
      storeHostSessionCode(created.session.code);
      setSession(created);
      setLastEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create phone lobby");
    } finally {
      setLoading(false);
    }
  };

  const handleCloseLobby = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await closeSession(session.session.code);
      clearHostSessionCode();
      setSession(null);
      setLastEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to end session");
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateCode = async () => {
    if (!session) return;
    setLoading(true);
    setError(null);
    try {
      await closeSession(session.session.code);
      clearHostSessionCode();
      const created = await createSession();
      storeHostSessionCode(created.session.code);
      setSession(created);
      setLastEventId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to regenerate code");
    } finally {
      setLoading(false);
    }
  };

  const sortedPlayers = session
    ? [...session.players].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      )
    : [];
  const playerCount = sortedPlayers.length;
  const gridClass =
    playerCount <= 3 ? "host-lobby-grid host-lobby-grid-1" : "host-lobby-grid host-lobby-grid-5";
  const suspectImageById: Record<string, string> = {
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
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl">Phone Lobby</h2>
          <p className="text-muted-foreground">
            Let detectives join from their phones before you begin.
          </p>
        </div>
        <Button variant="outline" onClick={() => onNavigate("/")}>
          Back to Games
        </Button>
      </div>

      {!session ? (
        <Card>
          <CardHeader>
            <CardTitle>Start a Phone Lobby</CardTitle>
            <CardDescription>
              Generate a join code for players. You can end the lobby at any time.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={handleCreateLobby} disabled={loading}>
              {loading ? "Creating Lobby..." : "Start Phone Lobby"}
            </Button>
            {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card className="border-primary/40 host-lobby-code-card">
            <CardHeader>
              <CardTitle className="text-center">Join Code</CardTitle>
              <CardDescription className="text-center">
                Players visit <strong>#/phone</strong> to join.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="host-lobby-code">{session.session.code}</div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" onClick={handleRegenerateCode} disabled={loading}>
                  Regenerate Code
                </Button>
                <Button variant="outline" onClick={handleCloseLobby} disabled={loading}>
                  <DoorOpen className="mr-2 h-4 w-4" />
                  End Session
                </Button>
              </div>
              <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
                <QrCode className="h-4 w-4" />
                Players can type the code on their phone.
              </div>
              {error && <p className="text-center text-sm text-destructive">{error}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detectives</CardTitle>
              <CardDescription>Lead detective can start the game from their phone.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sortedPlayers.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Waiting for players to join...
                </div>
              ) : (
                <div className={gridClass}>
                  {sortedPlayers.map((player, index) => (
                    <div key={player.id} className="host-lobby-card">
                      <div className="host-lobby-portrait">
                        <img src={suspectImageById[player.suspectId]} alt={player.suspectName} />
                      </div>
                      <div className="host-lobby-info">
                        <div className="host-lobby-name">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          <span>{player.name}</span>
                        </div>
                        <div className="host-lobby-suspect">
                          {player.suspectName}
                          {index === 0 ? " · Lead" : ""}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
