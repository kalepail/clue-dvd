import type { PhoneEvent, PhoneSessionSummary, PhoneWsMessage } from "../../phone/types";

type PhoneSocketHandlers = {
  onSession?: (summary: PhoneSessionSummary) => void;
  onEvent?: (event: PhoneEvent) => void;
  onOpen?: () => void;
  onClose?: (event: CloseEvent) => void;
};

type PhoneSocketOptions = {
  getLastEventId?: () => number | null;
};

const buildSocketUrl = (code: string) => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/api/phone/sessions/${code}/ws`;
};

export const connectPhoneSessionSocket = (
  code: string,
  handlers: PhoneSocketHandlers,
  options: PhoneSocketOptions = {}
) => {
  let socket: WebSocket | null = null;
  let closed = false;
  let retry = 0;
  let retryTimer: number | null = null;

  const clearRetry = () => {
    if (retryTimer) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (closed) return;
    const delay = Math.min(10000, 500 + retry * 800);
    retry += 1;
    clearRetry();
    retryTimer = window.setTimeout(connect, delay);
  };

  const handleMessage = (event: MessageEvent) => {
    let parsed: PhoneWsMessage | null = null;
    try {
      parsed = JSON.parse(String(event.data)) as PhoneWsMessage;
    } catch {
      return;
    }
    if (!parsed) return;
    if (parsed.type === "session") {
      handlers.onSession?.({ session: parsed.session, players: parsed.players });
      return;
    }
    if (parsed.type === "event") {
      handlers.onEvent?.(parsed.event);
    }
  };

  const connect = () => {
    if (closed) return;
    socket = new WebSocket(buildSocketUrl(code));
    socket.addEventListener("open", () => {
      retry = 0;
      handlers.onOpen?.();
      const lastEventId = options.getLastEventId?.() ?? null;
      socket?.send(JSON.stringify({ type: "resume", lastEventId }));
    });
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", (event) => {
      handlers.onClose?.(event);
      scheduleReconnect();
    });
  };

  connect();

  return () => {
    closed = true;
    clearRetry();
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
  };
};
