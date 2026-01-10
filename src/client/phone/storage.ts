const STORAGE_PREFIX = "clue-phone-session";
const HOST_SESSION_KEY = "clue-phone-host-session";
const HOST_AUTO_CREATE_KEY = "clue-phone-host-autocreate";

export interface PhoneStoredPlayer {
  playerId: string;
  reconnectToken: string;
  name: string;
  suspectId: string;
}

function buildKey(code: string): string {
  return `${STORAGE_PREFIX}:${code}`;
}

export function loadStoredPlayer(code: string): PhoneStoredPlayer | null {
  try {
    const raw = localStorage.getItem(buildKey(code));
    if (!raw) return null;
    return JSON.parse(raw) as PhoneStoredPlayer;
  } catch {
    return null;
  }
}

export function storePlayer(code: string, player: PhoneStoredPlayer): void {
  try {
    localStorage.setItem(buildKey(code), JSON.stringify(player));
  } catch (error) {
    console.error("Failed to store phone player info:", error);
  }
}

export function clearStoredPlayer(code: string): void {
  localStorage.removeItem(buildKey(code));
}

export function storeHostSessionCode(code: string): void {
  try {
    localStorage.setItem(HOST_SESSION_KEY, code);
  } catch (error) {
    console.error("Failed to store host session code:", error);
  }
}

export function loadHostSessionCode(): string | null {
  try {
    return localStorage.getItem(HOST_SESSION_KEY);
  } catch {
    return null;
  }
}

export function clearHostSessionCode(): void {
  localStorage.removeItem(HOST_SESSION_KEY);
}

export function setHostAutoCreate(value: boolean): void {
  try {
    if (value) {
      localStorage.setItem(HOST_AUTO_CREATE_KEY, "1");
    } else {
      localStorage.removeItem(HOST_AUTO_CREATE_KEY);
    }
  } catch (error) {
    console.error("Failed to update host auto-create flag:", error);
  }
}

export function consumeHostAutoCreate(): boolean {
  try {
    const value = localStorage.getItem(HOST_AUTO_CREATE_KEY);
    if (value) {
      localStorage.removeItem(HOST_AUTO_CREATE_KEY);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
