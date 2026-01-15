import { Hono } from "hono";
import {
  createEvent,
  createPlayer,
  createSession,
  getPlayerByToken,
  getSessionById,
  getSessionByCode,
  listEvents,
  listPlayers,
  touchPlayer,
  updatePlayerAccusationResult,
  updatePlayer,
  updatePlayerInspectorNotes,
  updateSessionInspectorAvailability,
  updateSessionInterruptionStatus,
} from "./session-store";
import { normalizeSessionCode } from "./utils";
import type { PhoneEliminations, PhoneEvent, PhoneEventType, PhoneWsMessage } from "./types";

const phone = new Hono<{ Bindings: CloudflareBindings }>();

const broadcastMessage = async (
  env: CloudflareBindings,
  code: string,
  message: PhoneWsMessage
) => {
  const normalized = normalizeSessionCode(code);
  const id = env.PHONE_SESSION_HUB.idFromName(normalized);
  const stub = env.PHONE_SESSION_HUB.get(id);
  try {
    await stub.fetch(`https://phone-session-hub/broadcast?code=${normalized}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });
  } catch {
    // Ignore websocket broadcast failures to keep REST flows stable.
  }
};

const broadcastSessionSnapshot = async (env: CloudflareBindings, code: string) => {
  const session = await getSessionByCode(env.DB, code);
  if (!session) return;
  const players = await listPlayers(env.DB, session.id);
  await broadcastMessage(env, code, { type: "session", session, players });
};

const broadcastEvent = async (env: CloudflareBindings, code: string, event: PhoneEvent) => {
  await broadcastMessage(env, code, { type: "event", event });
};

// Create a new phone session (host lobby)
phone.post("/sessions", async (c) => {
  try {
    const session = await createSession(c.env.DB);
    return c.json({ session, players: [] });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to create session" },
      500
    );
  }
});

// Get session + players by code
phone.get("/sessions/:code", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const players = await listPlayers(c.env.DB, session.id);
  return c.json({ session, players });
});

// WebSocket connection for live session updates
phone.get("/sessions/:code/ws", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const url = `http://phone-session-hub/ws?code=${code}`;
  const id = c.env.PHONE_SESSION_HUB.idFromName(code);
  const stub = c.env.PHONE_SESSION_HUB.get(id);
  return stub.fetch(
    new Request(url, {
      method: "GET",
      headers: c.req.raw.headers,
    })
  );
});

// Close a session (host-only action)
phone.post("/sessions/:code/close", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  await c.env.DB
    .prepare("UPDATE phone_sessions SET status = 'closed', updated_at = datetime('now') WHERE id = ?")
    .bind(session.id)
    .run();
  await broadcastSessionSnapshot(c.env, code);
  return c.json({ success: true });
});

// Update the current turn (host action)
phone.post("/sessions/:code/turn", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const body = await c.req
    .json<{ suspectId?: string | null }>()
    .catch(() => ({} as { suspectId?: string | null }));
  const suspectId = typeof body.suspectId === "string" ? body.suspectId : null;
  await c.env.DB
    .prepare("UPDATE phone_sessions SET current_turn_suspect_id = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(suspectId, session.id)
    .run();
  await broadcastSessionSnapshot(c.env, code);
  return c.json({ success: true });
});

// Record accusation result for a player (host action)
phone.post("/sessions/:code/accusation-result", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const body = await c.req
    .json<{
      suspectId?: string;
      correct?: boolean;
      correctCount?: number;
    }>()
    .catch(() => ({} as { suspectId?: string; correct?: boolean; correctCount?: number }));
  if (!body.suspectId || typeof body.correct !== "boolean") {
    return c.json({ error: "Invalid accusation result payload" }, 400);
  }
  const correctCount = typeof body.correctCount === "number" ? body.correctCount : 0;
  await updatePlayerAccusationResult(c.env.DB, session.id, body.suspectId, {
    correct: body.correct,
    correctCount,
  });
  await broadcastSessionSnapshot(c.env, code);
  return c.json({ success: true });
});

// Update inspector note availability (host action)
phone.post("/sessions/:code/notes-availability", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const body = await c.req
    .json<{ note1Available?: boolean; note2Available?: boolean }>()
    .catch(() => ({} as { note1Available?: boolean; note2Available?: boolean }));
  if (typeof body.note1Available !== "boolean" || typeof body.note2Available !== "boolean") {
    return c.json({ error: "Invalid availability payload" }, 400);
  }
  await updateSessionInspectorAvailability(c.env.DB, session.id, {
    note1Available: body.note1Available,
    note2Available: body.note2Available,
  });
  await broadcastSessionSnapshot(c.env, code);
  return c.json({ success: true });
});

// Update interruption status (host action)
phone.post("/sessions/:code/interruption", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const body = await c.req
    .json<{ active?: boolean; message?: string }>()
    .catch(() => ({} as { active?: boolean; message?: string }));
  if (typeof body.active !== "boolean" || typeof body.message !== "string") {
    return c.json({ error: "Invalid interruption payload" }, 400);
  }
  await updateSessionInterruptionStatus(c.env.DB, session.id, {
    active: body.active,
    message: body.message,
  });
  await broadcastSessionSnapshot(c.env, code);
  return c.json({ success: true });
});

// Record inspector note read (host action)
phone.post("/sessions/:code/inspector-note", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const body = await c.req
    .json<{
      suspectId?: string;
      noteId?: string;
      noteText?: string;
    }>()
    .catch(() => ({} as { suspectId?: string; noteId?: string; noteText?: string }));

  if (!body.suspectId || !body.noteId || !body.noteText) {
    return c.json({ error: "Invalid inspector note payload" }, 400);
  }

  await updatePlayerInspectorNotes(c.env.DB, session.id, body.suspectId, body.noteId, body.noteText);
  await broadcastSessionSnapshot(c.env, code);
  return c.json({ success: true });
});

// Join session as player
phone.post("/sessions/:code/join", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const body = await c.req
    .json<{
      name?: string;
      suspectId?: string;
    }>()
    .catch(() => ({} as { name?: string; suspectId?: string }));

  if (!body.name || !body.suspectId) {
    return c.json({ error: "Name and suspectId are required" }, 400);
  }

  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const existing = await c.env.DB
    .prepare("SELECT id FROM phone_players WHERE session_id = ? AND suspect_id = ?")
    .bind(session.id, body.suspectId)
    .first();
  if (existing) {
    return c.json({ error: "Suspect already taken" }, 409);
  }

  try {
    const { player, reconnectToken } = await createPlayer(
      c.env.DB,
      session.id,
      body.name.trim(),
      body.suspectId
    );
    await broadcastSessionSnapshot(c.env, code);
    return c.json({ session, player, reconnectToken });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Failed to join session" },
      500
    );
  }
});

// Reconnect with token
phone.post("/sessions/:code/reconnect", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const body = await c.req
    .json<{ reconnectToken?: string }>()
    .catch(() => ({} as { reconnectToken?: string }));
  if (!body.reconnectToken) {
    return c.json({ error: "Reconnect token required" }, 400);
  }

  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  const player = await getPlayerByToken(c.env.DB, session.id, body.reconnectToken);
  if (!player) {
    return c.json({ error: "Player not found" }, 404);
  }

  await touchPlayer(c.env.DB, player.id);
  return c.json({ session, player, reconnectToken: body.reconnectToken });
});

// Update player notes/eliminations
phone.patch("/players/:playerId", async (c) => {
  const playerId = c.req.param("playerId");
  const body = await c.req
    .json<{
      reconnectToken?: string;
      notes?: string;
      eliminations?: PhoneEliminations;
    }>()
    .catch(() => ({} as { reconnectToken?: string; notes?: string; eliminations?: PhoneEliminations }));

  if (!body.reconnectToken) {
    return c.json({ error: "Reconnect token required" }, 400);
  }

  const row = await c.env.DB
    .prepare("SELECT session_id, reconnect_token FROM phone_players WHERE id = ?")
    .bind(playerId)
    .first();
  if (!row) {
    return c.json({ error: "Player not found" }, 404);
  }
  if (row.reconnect_token !== body.reconnectToken) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  const player = await updatePlayer(c.env.DB, playerId, {
    notes: body.notes,
    eliminations: body.eliminations,
  });

  if (!player) {
    return c.json({ error: "Player not found" }, 404);
  }
  return c.json({ player });
});

// Record a player action (turn action or accusation)
phone.post("/players/:playerId/actions", async (c) => {
  const playerId = c.req.param("playerId");
  const body = await c.req
    .json<{
      reconnectToken?: string;
      type?: PhoneEventType;
      payload?: Record<string, unknown>;
    }>()
    .catch(() => ({} as { reconnectToken?: string; type?: PhoneEventType; payload?: Record<string, unknown> }));

  if (!body.reconnectToken || !body.type) {
    return c.json({ error: "Reconnect token and type required" }, 400);
  }

  const row = await c.env.DB
    .prepare("SELECT session_id, reconnect_token FROM phone_players WHERE id = ?")
    .bind(playerId)
    .first();
  if (!row) {
    return c.json({ error: "Player not found" }, 404);
  }
  if (row.reconnect_token !== body.reconnectToken) {
    return c.json({ error: "Unauthorized" }, 403);
  }

  const event = await createEvent(
    c.env.DB,
    row.session_id as string,
    playerId,
    body.type,
    body.payload ?? {}
  );

  if (
    body.type === "turn_action" &&
    typeof body.payload?.action === "string" &&
    body.payload.action === "start_game"
  ) {
    await c.env.DB
      .prepare("UPDATE phone_sessions SET status = 'active', updated_at = datetime('now') WHERE id = ?")
      .bind(row.session_id as string)
      .run();
  }

  await touchPlayer(c.env.DB, playerId);
  const session = await getSessionById(c.env.DB, row.session_id as string);
  if (session) {
    await broadcastEvent(c.env, session.code, event);
    await broadcastSessionSnapshot(c.env, session.code);
  }
  return c.json({ event });
});

export default phone;
