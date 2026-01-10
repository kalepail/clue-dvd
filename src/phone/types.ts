export type PhoneSessionStatus = "lobby" | "active" | "closed";

export interface PhoneSession {
  id: string;
  code: string;
  status: PhoneSessionStatus;
  currentTurnSuspectId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PhoneEliminations {
  suspects: string[];
  items: string[];
  locations: string[];
  times: string[];
}

export interface PhonePlayer {
  id: string;
  sessionId: string;
  name: string;
  suspectId: string;
  notes: string;
  eliminations: PhoneEliminations;
  createdAt: string;
  lastSeenAt: string;
}

export type PhoneEventType = "turn_action" | "accusation";

export interface PhoneEvent {
  id: number;
  sessionId: string;
  playerId: string;
  type: PhoneEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PhoneSessionSummary {
  session: PhoneSession;
  players: PhonePlayer[];
}

export interface PhoneJoinResponse {
  session: PhoneSession;
  player: PhonePlayer;
  reconnectToken: string;
}
