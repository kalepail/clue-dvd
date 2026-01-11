export type PhoneSessionStatus = "lobby" | "active" | "closed";

export interface PhoneSession {
  id: string;
  code: string;
  status: PhoneSessionStatus;
  currentTurnSuspectId?: string | null;
  note1Available?: boolean;
  note2Available?: boolean;
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
  suspectName: string;
  notes: string;
  eliminations: PhoneEliminations;
  inspectorNotes: string[];
  inspectorNoteTexts: Record<string, string>;
  lastAccusationResult?: {
    correct: boolean;
    correctCount: number;
    updatedAt: string;
  } | null;
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
