const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function normalizeSessionCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function generateSessionCode(length = 4): string {
  const chars = CODE_CHARS;
  let result = "";
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  for (let i = 0; i < length; i += 1) {
    result += chars[values[i] % chars.length];
  }
  return result;
}

export function generateReconnectToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function emptyEliminations() {
  return { suspects: [], items: [], locations: [], times: [] };
}

