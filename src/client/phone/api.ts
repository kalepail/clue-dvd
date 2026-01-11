import type {
  PhoneEliminations,
  PhoneJoinResponse,
  PhoneSessionSummary,
  PhoneEventType,
} from "../../phone/types";

export async function createSession(): Promise<PhoneSessionSummary> {
  const response = await fetch("/api/phone/sessions", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to create session");
  }
  return response.json();
}

export async function getSession(code: string): Promise<PhoneSessionSummary> {
  const response = await fetch(`/api/phone/sessions/${code}`);
  if (!response.ok) {
    throw new Error("Session not found");
  }
  return response.json();
}

export async function joinSession(
  code: string,
  name: string,
  suspectId: string
): Promise<PhoneJoinResponse> {
  const response = await fetch(`/api/phone/sessions/${code}/join`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, suspectId }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Failed to join session");
  }
  return response.json();
}

export async function reconnectSession(
  code: string,
  reconnectToken: string
): Promise<PhoneJoinResponse> {
  const response = await fetch(`/api/phone/sessions/${code}/reconnect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reconnectToken }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Failed to reconnect");
  }
  return response.json();
}

export async function updatePlayer(
  playerId: string,
  reconnectToken: string,
  updates: { notes?: string; eliminations?: PhoneEliminations }
): Promise<void> {
  const response = await fetch(`/api/phone/players/${playerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reconnectToken, ...updates }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error || "Failed to update player");
  }
}

export async function sendPlayerAction(
  playerId: string,
  reconnectToken: string,
  type: PhoneEventType,
  payload: Record<string, unknown>
): Promise<void> {
  const response = await fetch(`/api/phone/players/${playerId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reconnectToken, type, payload }),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Failed to send action");
  }
}

export async function getSessionEvents(
  code: string,
  sinceId?: number
): Promise<{ events: { id: number; type: PhoneEventType; payload: Record<string, unknown> }[] }> {
  const query = sinceId ? `?since=${sinceId}` : "";
  const response = await fetch(`/api/phone/sessions/${code}/events${query}`);
  if (!response.ok) {
    throw new Error("Failed to fetch session events");
  }
  return response.json();
}

export async function closeSession(code: string): Promise<void> {
  const response = await fetch(`/api/phone/sessions/${code}/close`, { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to close session");
  }
}

export async function updateSessionTurn(
  code: string,
  suspectId: string | null
): Promise<void> {
  const response = await fetch(`/api/phone/sessions/${code}/turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suspectId }),
  });
  if (!response.ok) {
    throw new Error("Failed to update session turn");
  }
}

export async function sendAccusationResult(
  code: string,
  suspectId: string,
  result: { correct: boolean; correctCount: number }
): Promise<void> {
  const response = await fetch(`/api/phone/sessions/${code}/accusation-result`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suspectId, correct: result.correct, correctCount: result.correctCount }),
  });
  if (!response.ok) {
    throw new Error("Failed to record accusation result");
  }
}

export async function updateInspectorNoteAvailability(
  code: string,
  availability: { note1Available: boolean; note2Available: boolean }
): Promise<void> {
  const response = await fetch(`/api/phone/sessions/${code}/notes-availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(availability),
  });
  if (!response.ok) {
    throw new Error("Failed to update inspector note availability");
  }
}

export async function sendInspectorNoteResult(
  code: string,
  suspectId: string,
  noteId: string,
  noteText: string
): Promise<void> {
  const response = await fetch(`/api/phone/sessions/${code}/inspector-note`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suspectId, noteId, noteText }),
  });
  if (!response.ok) {
    throw new Error("Failed to record inspector note");
  }
}
