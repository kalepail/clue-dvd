import { useState, useEffect } from "react";
import HomePage from "./pages/HomePage";
import GamePage from "./pages/GamePage";

type Route = { page: "home" } | { page: "game"; gameId: string };

function parseRoute(): Route {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith("/game/")) {
    return { page: "game", gameId: hash.slice(6) };
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

  return (
    <>
      <header className="header">
        <h1>Clue DVD Game</h1>
        <p className="subtitle">Mystery at Tudor Mansion, 1926</p>
        <nav className="nav">
          <a
            href="#/"
            className={`nav-link ${route.page === "home" ? "active" : ""}`}
          >
            Games
          </a>
        </nav>
      </header>

      <main className="container">
        {route.page === "home" ? (
          <HomePage onNavigate={navigate} />
        ) : (
          <GamePage gameId={route.gameId} onNavigate={navigate} />
        )}
      </main>
    </>
  );
}
