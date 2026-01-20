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
// Note: Game session management is now handled client-side via useGameStore
export const api = {
  // Stats
  getStats: () => fetch("/api/stats").then((r) => r.json()),

  // Game Elements
  getSuspects: () => fetch("/api/suspects").then((r) => r.json()),
  getItems: () => fetch("/api/items").then((r) => r.json()),
  getLocations: () => fetch("/api/locations").then((r) => r.json()),
  getTimes: () => fetch("/api/times").then((r) => r.json()),
  getThemes: () => fetch("/api/themes").then((r) => r.json()),

  // Scenario Generation
  generateScenario: (options: {
    themeId?: string;
    difficulty?: string;
    seed?: number;
  }) =>
    fetch("/api/scenarios/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    }).then((r) => r.json()),
};
