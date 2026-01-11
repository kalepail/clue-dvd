import { useState, useEffect } from "react";
import HomePage from "./pages/HomePage";
import GamePage from "./pages/GamePage";
import HostLobbyPage from "./pages/HostLobbyPage";
import PhoneJoinPage from "./phone/PhoneJoinPage";
import PhoneHostPage from "./phone/PhoneHostPage";
import PhonePlayerPage from "./phone/PhonePlayerPage";
import { cn } from "@/client/lib/utils";

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
    return { page: "phone", view: "player", code: hash.slice(15) };
  }
  if (hash.startsWith("/phone")) {
    return { page: "phone", view: "join" };
  }
  return { page: "home" };
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

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
      {route.page === "home" && (
        <header className="bg-gradient-to-b from-secondary to-background border-b-2 border-primary p-6 text-center">
          <h1 className="mb-1">Clue DVD Game</h1>
          <p className="text-muted-foreground italic text-lg">
            Mystery at Tudor Mansion, 1926
          </p>
          <nav className="flex justify-center gap-4 mt-4">
            <a
              href="#/"
              className={cn(
                "text-muted-foreground no-underline px-4 py-2 border-b-2 border-transparent transition-all uppercase text-sm tracking-wide",
                "hover:text-primary hover:border-primary",
                route.page === "home" && "text-primary border-primary"
              )}
              style={{ fontFamily: "var(--font-display)" }}
            >
              Games
            </a>
          </nav>
        </header>
      )}

      <main className="max-w-6xl mx-auto p-8 flex-1">
        {route.page === "home" ? (
          <HomePage onNavigate={navigate} />
        ) : (
          <GamePage gameId={route.gameId} onNavigate={navigate} />
        )}
      </main>
    </>
  );
}
