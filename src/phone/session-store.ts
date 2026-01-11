import type { D1Database } from "@cloudflare/workers-types";
import type {
  PhoneEliminations,
  PhoneEvent,
  PhoneEventType,
  PhonePlayer,
  PhoneSession,
  PhoneSessionStatus,
} from "./types";
import {
  emptyEliminations,
  generateReconnectToken,
  generateSessionCode,
  normalizeSessionCode,
} from "./utils";

const DEFAULT_STATUS: PhoneSessionStatus = "lobby";

function rowToSession(row: Record<string, string>): PhoneSession {
  return {
    id: row.id,
    code: row.code,
    status: row.status as PhoneSessionStatus,
    currentTurnSuspectId: row.current_turn_suspect_id ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPlayer(row: Record<string, string>): PhonePlayer {
  const eliminations = parseEliminations(row.eliminations);
  return {
    id: row.id,
    sessionId: row.session_id,
    name: row.name,
    suspectId: row.suspect_id,
    suspectName: row.suspect_name || row.suspect_id,
    notes: row.notes,
    eliminations,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

function parseEliminations(value: string | null): PhoneEliminations {
  if (!value) return emptyEliminations();
  try {
    const parsed = JSON.parse(value) as PhoneEliminations;
    return {
      suspects: parsed.suspects ?? [],
      items: parsed.items ?? [],
      locations: parsed.locations ?? [],
      times: parsed.times ?? [],
    };
  } catch {
    return emptyEliminations();
  }
}

function serializeEliminations(value: PhoneEliminations): string {
  return JSON.stringify({
    suspects: value.suspects ?? [],
    items: value.items ?? [],
    locations: value.locations ?? [],
    times: value.times ?? [],
  });
}

export async function createSession(db: D1Database): Promise<PhoneSession> {
  let attempts = 0;
  while (attempts < 20) {
    const code = generateSessionCode(4);
    const existing = await db.prepare("SELECT id FROM phone_sessions WHERE code = ?").bind(code).first();
    if (existing) {
      attempts += 1;
      continue;
    }
    const id = crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO phone_sessions (id, code, status) VALUES (?, ?, ?)"
      )
      .bind(id, code, DEFAULT_STATUS)
      .run();
    const row = await db.prepare("SELECT * FROM phone_sessions WHERE id = ?").bind(id).first();
    if (row) return rowToSession(row as Record<string, string>);
    attempts += 1;
  }
  throw new Error("Failed to create a new session code");
}

export async function getSessionByCode(
  db: D1Database,
  code: string
): Promise<PhoneSession | null> {
  const normalized = normalizeSessionCode(code);
  const row = await db.prepare("SELECT * FROM phone_sessions WHERE code = ?").bind(normalized).first();
  if (!row) return null;
  return rowToSession(row as Record<string, string>);
}

export async function listPlayers(
  db: D1Database,
  sessionId: string
): Promise<PhonePlayer[]> {
  const result = await db
    .prepare("SELECT * FROM phone_players WHERE session_id = ? ORDER BY created_at ASC")
    .bind(sessionId)
    .all();
  return (result.results as Record<string, string>[]).map(rowToPlayer);
}

export async function createPlayer(
  db: D1Database,
  sessionId: string,
  name: string,
  suspectId: string
): Promise<{ player: PhonePlayer; reconnectToken: string }> {
  const suspectNameMap: Record<string, string> = {
    S01: "Miss Scarlet",
    S02: "Colonel Mustard",
    S03: "Mrs. White",
    S04: "Mr. Green",
    S05: "Mrs. Peacock",
    S06: "Professor Plum",
    S07: "Mrs. Meadow-Brook",
    S08: "Prince Azure",
    S09: "Lady Lavender",
    S10: "Rusty",
  };
  const playerId = crypto.randomUUID();
  const reconnectToken = generateReconnectToken();
  const eliminations = serializeEliminations(emptyEliminations());
  await db
    .prepare(
      "INSERT INTO phone_players (id, session_id, name, suspect_id, suspect_name, reconnect_token, notes, eliminations) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      playerId,
      sessionId,
      name,
      suspectId,
      suspectNameMap[suspectId] ?? suspectId,
      reconnectToken,
      "",
      eliminations
    )
    .run();
  const row = await db.prepare("SELECT * FROM phone_players WHERE id = ?").bind(playerId).first();
  if (!row) {
    throw new Error("Failed to create player");
  }
  return { player: rowToPlayer(row as Record<string, string>), reconnectToken };
}

export async function getPlayerByToken(
  db: D1Database,
  sessionId: string,
  reconnectToken: string
): Promise<PhonePlayer | null> {
  const row = await db
    .prepare(
      "SELECT * FROM phone_players WHERE session_id = ? AND reconnect_token = ?"
    )
    .bind(sessionId, reconnectToken)
    .first();
  if (!row) return null;
  return rowToPlayer(row as Record<string, string>);
}

export async function updatePlayer(
  db: D1Database,
  playerId: string,
  updates: { notes?: string; eliminations?: PhoneEliminations }
): Promise<PhonePlayer | null> {
  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.notes !== undefined) {
    fields.push("notes = ?");
    values.push(updates.notes);
  }
  if (updates.eliminations !== undefined) {
    fields.push("eliminations = ?");
    values.push(serializeEliminations(updates.eliminations));
  }

  fields.push("last_seen_at = datetime('now')");

  if (fields.length > 0) {
    await db
      .prepare(`UPDATE phone_players SET ${fields.join(", ")} WHERE id = ?`)
      .bind(...values, playerId)
      .run();
  }

  const row = await db.prepare("SELECT * FROM phone_players WHERE id = ?").bind(playerId).first();
  if (!row) return null;
  return rowToPlayer(row as Record<string, string>);
}

export async function touchPlayer(
  db: D1Database,
  playerId: string
): Promise<void> {
  await db
    .prepare("UPDATE phone_players SET last_seen_at = datetime('now') WHERE id = ?")
    .bind(playerId)
    .run();
}

export async function createEvent(
  db: D1Database,
  sessionId: string,
  playerId: string,
  type: PhoneEventType,
  payload: Record<string, unknown>
): Promise<PhoneEvent> {
  await db
    .prepare(
      "INSERT INTO phone_events (session_id, player_id, type, payload) VALUES (?, ?, ?, ?)"
    )
    .bind(sessionId, playerId, type, JSON.stringify(payload))
    .run();

  const row = await db
    .prepare(
      "SELECT * FROM phone_events WHERE session_id = ? AND player_id = ? ORDER BY id DESC LIMIT 1"
    )
    .bind(sessionId, playerId)
    .first();
  if (!row) throw new Error("Failed to create event");

  return {
    id: row.id as number,
    sessionId: row.session_id as string,
    playerId: row.player_id as string,
    type: row.type as PhoneEventType,
    payload: JSON.parse(row.payload as string) as Record<string, unknown>,
    createdAt: row.created_at as string,
  };
}

export async function listEvents(
  db: D1Database,
  sessionId: string,
  sinceId?: number
): Promise<PhoneEvent[]> {
  const query = sinceId
    ? "SELECT * FROM phone_events WHERE session_id = ? AND id > ? ORDER BY id ASC"
    : "SELECT * FROM phone_events WHERE session_id = ? ORDER BY id ASC";
  const stmt = db.prepare(query);
  const result = sinceId
    ? await stmt.bind(sessionId, sinceId).all()
    : await stmt.bind(sessionId).all();
  return (result.results as Record<string, string>[]).map((row) => ({
    id: row.id as unknown as number,
    sessionId: row.session_id,
    playerId: row.player_id,
    type: row.type as PhoneEventType,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at,
  }));
}
