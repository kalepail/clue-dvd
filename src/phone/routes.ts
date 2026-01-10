import { Hono } from "hono";
import {
  createEvent,
  createPlayer,
  createSession,
  getPlayerByToken,
  getSessionByCode,
  listEvents,
  listPlayers,
  touchPlayer,
  updatePlayer,
} from "./session-store";
import { normalizeSessionCode } from "./utils";
import type { PhoneEliminations, PhoneEventType } from "./types";

const phone = new Hono<{ Bindings: CloudflareBindings }>();

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
  return c.json({ success: true });
});

// Update the current turn (host action)
phone.post("/sessions/:code/turn", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const body = await c.req.json<{ suspectId?: string | null }>().catch(() => ({}));
  const suspectId = typeof body.suspectId === "string" ? body.suspectId : null;
  await c.env.DB
    .prepare("UPDATE phone_sessions SET current_turn_suspect_id = ?, updated_at = datetime('now') WHERE id = ?")
    .bind(suspectId, session.id)
    .run();
  return c.json({ success: true });
});

// Join session as player
phone.post("/sessions/:code/join", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const body = await c.req.json<{
    name?: string;
    suspectId?: string;
  }>().catch(() => ({}));

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
  const body = await c.req.json<{ reconnectToken?: string }>().catch(() => ({}));
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
  const body = await c.req.json<{
    reconnectToken?: string;
    notes?: string;
    eliminations?: PhoneEliminations;
  }>().catch(() => ({}));

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
  const body = await c.req.json<{
    reconnectToken?: string;
    type?: PhoneEventType;
    payload?: Record<string, unknown>;
  }>().catch(() => ({}));

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
  return c.json({ event });
});

// Fetch events for host (future integration)
phone.get("/sessions/:code/events", async (c) => {
  const code = normalizeSessionCode(c.req.param("code"));
  const session = await getSessionByCode(c.env.DB, code);
  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }
  const since = c.req.query("since");
  const sinceId = since ? Number(since) : undefined;
  const events = await listEvents(c.env.DB, session.id, Number.isFinite(sinceId) ? sinceId : undefined);
  return c.json({ events });
});

export default phone;
