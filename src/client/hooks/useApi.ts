import { useState, useCallback } from "react";

interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>() {
  const [state, setState] = useState<ApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async (url: string, options?: RequestInit): Promise<T | null> => {
      setState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const response = await fetch(url, {
          headers: { "Content-Type": "application/json" },
          ...options,
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            (errorData as { error?: string }).error ||
              `Request failed: ${response.status}`
          );
        }
        const data = (await response.json()) as T;
        setState({ data, loading: false, error: null });
        return data;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({ data: null, loading: false, error: message });
        return null;
      }
    },
    []
  );

  return { ...state, execute };
}

// Convenience functions for common API calls
export const api = {
  // Stats
  getStats: () => fetch("/api/stats").then((r) => r.json()),

  // Games
  listGames: () => fetch("/api/games").then((r) => r.json()),
  getGame: (id: string) => fetch(`/api/games/${id}`).then((r) => r.json()),
  getGameHistory: (id: string) =>
    fetch(`/api/games/${id}/history`).then((r) => r.json()),

  createGame: (options: {
    themeId?: string;
    difficulty?: string;
    playerCount?: number;
  }) =>
    fetch("/api/games", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    }).then((r) => r.json()),

  startGame: (id: string) =>
    fetch(`/api/games/${id}/start`, { method: "POST" }).then((r) => r.json()),

  // Clues (AI-enhanced)
  revealNextClue: (id: string) =>
    fetch(`/api/games/${id}/ai/clues/next`, { method: "POST" }).then((r) =>
      r.json()
    ),

  // Accusation (AI-enhanced)
  makeAccusation: (
    id: string,
    accusation: {
      player: string;
      suspectId: string;
      itemId: string;
      locationId: string;
      timeId: string;
    }
  ) =>
    fetch(`/api/games/${id}/ai/accuse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(accusation),
    }).then((r) => r.json()),

  // AI features
  getAIContext: (id: string) =>
    fetch(`/api/games/${id}/ai/context`).then((r) => r.json()),
  getCommentary: (id: string) =>
    fetch(`/api/games/${id}/ai/commentary`).then((r) => r.json()),
};
