import { getSessionByCode, listEvents, listPlayers } from "./session-store";
import type { PhoneWsMessage } from "./types";

type PhoneWsClientMessage =
  | { type: "resume"; lastEventId?: number | null }
  | { type: "ping" };

export class PhoneSessionHub implements DurableObject {
  private state: DurableObjectState;
  private env: CloudflareBindings;

  constructor(state: DurableObjectState, env: CloudflareBindings) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      return this.handleWebSocket(request, url);
    }
    if (url.pathname === "/broadcast") {
      return this.handleBroadcast(request);
    }
    return new Response("Not found", { status: 404 });
  }

  private async handleWebSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket upgrade", { status: 400 });
    }
    const code = url.searchParams.get("code") ?? "";
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    this.state.acceptWebSocket(server);
    server.addEventListener("message", (event) => {
      void this.handleClientMessage(server, code, event);
    });
    server.addEventListener("error", () => {
      server.close(1011, "WebSocket error");
    });

    await this.sendSessionSnapshot(server, code);

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleBroadcast(request: Request): Promise<Response> {
    const message = await request.json<PhoneWsMessage>();
    this.broadcast(message);
    return new Response("ok");
  }

  private async handleClientMessage(socket: WebSocket, code: string, event: MessageEvent) {
    let parsed: PhoneWsClientMessage | null = null;
    try {
      parsed = JSON.parse(String(event.data)) as PhoneWsClientMessage;
    } catch {
      return;
    }

    if (parsed?.type === "ping") {
      this.safeSend(socket, { type: "pong" });
      return;
    }

    if (parsed?.type === "resume") {
      const session = await getSessionByCode(this.env.DB, code);
      if (!session) {
        this.safeSend(socket, { type: "error", message: "Session not found" });
        return;
      }
      const lastEventId =
        typeof parsed.lastEventId === "number" ? parsed.lastEventId : undefined;
      const events = await listEvents(this.env.DB, session.id, lastEventId);
      for (const entry of events) {
        this.safeSend(socket, { type: "event", event: entry });
      }
    }
  }

  private async sendSessionSnapshot(socket: WebSocket, code: string) {
    if (!code) {
      this.safeSend(socket, { type: "error", message: "Session code missing" });
      socket.close(1008, "Session code missing");
      return;
    }
    const session = await getSessionByCode(this.env.DB, code);
    if (!session) {
      this.safeSend(socket, { type: "error", message: "Session not found" });
      socket.close(1008, "Session not found");
      return;
    }
    const players = await listPlayers(this.env.DB, session.id);
    this.safeSend(socket, { type: "session", session, players });
  }

  private broadcast(message: PhoneWsMessage) {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      socket.send(payload);
    }
  }

  private safeSend(socket: WebSocket, message: Record<string, unknown>) {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }
}
