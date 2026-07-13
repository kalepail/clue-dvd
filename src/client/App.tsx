import { useState, useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import HomePage from "./pages/HomePage";
import GamePage from "./pages/GamePage";
import HostLobbyPage from "./pages/HostLobbyPage";
import PhoneJoinPage from "./phone/PhoneJoinPage";
import PhoneHostPage from "./phone/PhoneHostPage";
import PhonePlayerPage from "./phone/PhonePlayerPage";
import { cn } from "@/client/lib/utils";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";

type Route =
  | { page: "home" }
  | { page: "game"; gameId: string }
  | { page: "hostLobby" }
  | { page: "phone"; view: "join" | "host" | "player"; code?: string };

function parseRoute(): Route {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith("/game/")) {
    return { page: "game", gameId: hash.slice(6) };
  }
  if (hash.startsWith("/host-lobby")) {
    return { page: "hostLobby" };
  }
  if (hash.startsWith("/phone/host")) {
    return { page: "phone", view: "host" };
  }
  if (hash.startsWith("/phone/session/")) {
    const code = hash.slice(15).split("?")[0];
    return { page: "phone", view: "player", code };
  }
  if (hash.startsWith("/phone")) {
    return { page: "phone", view: "join" };
  }
  return { page: "home" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [musicMuted, setMusicMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("clue-dvd-music-muted") === "true";
  });
  const [musicPaused, setMusicPaused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const fadeTimerRef = useRef<number | null>(null);
  const targetVolumeRef = useRef(0.35);

  const shouldRenderMusic = route.page === "home" || route.page === "game";
  const shouldPlayMusic = shouldRenderMusic && !musicMuted && !musicPaused;

  useEffect(() => {
    const handleHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("clue-dvd-music-muted", String(musicMuted));
  }, [musicMuted]);

  useEffect(() => {
    const audio = musicRef.current;
    if (!audio) return;
    audio.loop = true;
    audio.volume = targetVolumeRef.current;

    const clearFade = () => {
      if (fadeTimerRef.current !== null) {
        window.clearInterval(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };

    const fadeTo = (target: number, done?: () => void) => {
      clearFade();
      const step = 0.04 * Math.sign(target - audio.volume);
      fadeTimerRef.current = window.setInterval(() => {
        const next = audio.volume + step;
        const reached = step > 0 ? next >= target : next <= target;
        audio.volume = reached ? target : Math.max(0, Math.min(1, next));
        if (reached) {
          clearFade();
          if (done) done();
        }
      }, 60);
    };

    if (!shouldPlayMusic) {
      fadeTo(0, () => audio.pause());
      return;
    }

    if (audio.paused) {
      audio.volume = 0;
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => {
          // Autoplay can be blocked until a user gesture.
        });
      }
    }
    fadeTo(targetVolumeRef.current);
  }, [shouldPlayMusic]);

  const navigate = (path: string) => {
    window.location.hash = path;
  };

  if (route.page === "hostLobby") {
    return <HostLobbyPage onNavigate={navigate} />;
  }

  if (route.page === "phone") {
    if (route.view === "host") {
      return <PhoneHostPage onNavigate={navigate} />;
    }
    if (route.view === "player" && route.code) {
      return <PhonePlayerPage code={route.code} onNavigate={navigate} />;
    }
    return <PhoneJoinPage onNavigate={navigate} />;
  }

  return (
    <>
      {shouldRenderMusic && (
        <audio ref={musicRef} src="/audio/menu.mp3" preload="auto" />
      )}
      {shouldRenderMusic && (
        <div className="settings-button-container">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSettings(true)}
            aria-label="Open settings"
            className="settings-button"
          >
            <Menu className="h-4 w-4" />
          </Button>
        </div>
      )}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Control audio and display preferences.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <label htmlFor="music-toggle" className="text-sm font-medium">
              Menu music
            </label>
            <input
              id="music-toggle"
              type="checkbox"
              checked={!musicMuted}
              onChange={(event) => setMusicMuted(!event.target.checked)}
            />
          </div>
        </DialogContent>
      </Dialog>
      {route.page === "home" && (
        <header className="host-header">
          <div className="host-header-inner">
            {/* Art Deco corner ornaments */}
            <div className="host-header-corner host-header-corner-tl" />
            <div className="host-header-corner host-header-corner-tr" />

            {/* Decorative top line */}
            <div className="host-header-deco-line" />

            {/* Title section */}
            <div className="host-header-title-section">
              <span className="host-header-subtitle-top">A Mystery at Tudor Mansion</span>
              <h1 className="host-header-title">Clue</h1>
              <div className="host-header-divider">
                <span className="host-header-divider-line" />
                <span className="host-header-divider-diamond" />
                <span className="host-header-divider-line" />
              </div>
              <span className="host-header-subtitle">DVD Game</span>
              <span className="host-header-year">Anno 1926</span>
            </div>

            {/* Navigation */}
            <nav className="host-header-nav">
              <a
                href="#/"
                className={cn(
                  "host-header-nav-link",
                  route.page === "home" && "active"
                )}
              >
                <span className="host-header-nav-icon">&#9670;</span>
                Investigations
                <span className="host-header-nav-icon">&#9670;</span>
              </a>
            </nav>
          </div>
        </header>
      )}

      <main className="max-w-6xl mx-auto p-8 flex-1">
        {route.page === "home" ? (
          <HomePage onNavigate={navigate} />
        ) : (
          <GamePage
            gameId={route.gameId}
            onNavigate={navigate}
            onMusicPauseChange={setMusicPaused}
          />
        )}
      </main>

      {route.page === "home" && (
        <footer className="host-footer">
          <div className="host-footer-inner">
            <div className="host-footer-deco">
              <span className="host-footer-deco-line" />
              <span className="host-footer-deco-diamond" />
              <span className="host-footer-deco-line" />
            </div>
            <div className="host-footer-content">
              <span className="host-footer-text">Tudor Mansion</span>
              <span className="host-footer-dot">&#8226;</span>
              <span className="host-footer-text">Est. 1926</span>
            </div>
            <p className="host-footer-tagline">
              &ldquo;The truth shall be revealed&rdquo;
            </p>
          </div>
        </footer>
      )}
    </>
  );
}
