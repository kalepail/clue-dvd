import { Hono } from "hono";

const tts = new Hono<{ Bindings: CloudflareBindings }>();

const MAX_TTS_CHARS = 2000;

type TtsRole = "butler" | "inspector";

const roleToVoiceBinding = (role: TtsRole) =>
  role === "inspector" ? "ELEVENLABS_INSPECTOR_VOICE_ID" : "ELEVENLABS_BUTLER_VOICE_ID";

const toHex = (buffer: ArrayBuffer) =>
  Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

async function buildCacheKey(text: string, role: TtsRole): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${role}:${text}`),
  );
  return toHex(hash);
}

tts.post("/tts", async (c) => {
  const payload = await c.req.json().catch(() => null);
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  const role = payload?.role === "inspector" ? "inspector" : "butler";

  if (!text) {
    return c.json({ error: "Missing text" }, 400);
  }
  if (text.length > MAX_TTS_CHARS) {
    return c.json({ error: "Text too long" }, 400);
  }

  const apiKey = c.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return c.json({ error: "TTS not configured" }, 500);
  }

  const voiceBinding = roleToVoiceBinding(role);
  const inspectorVoiceId = (c.env as Record<string, string | undefined>)[voiceBinding];
  const butlerVoiceId = (c.env as Record<string, string | undefined>).ELEVENLABS_BUTLER_VOICE_ID;
  const voiceId = inspectorVoiceId || butlerVoiceId;
  if (!voiceId) {
    return c.json({ error: "TTS voice not configured" }, 500);
  }

  const cacheKey = await buildCacheKey(text, role);
  const cacheUrl = new URL(c.req.url);
  cacheUrl.pathname = `/api/tts/${role}/${cacheKey}.mp3`;
  const cacheRequest = new Request(cacheUrl.toString(), { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheRequest);
  if (cached) {
    return cached;
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.8,
      },
    }),
  });

  if (!response.ok || !response.body) {
    const errorText = await response.text().catch(() => "");
    return c.json({ error: "TTS request failed", details: errorText }, 502);
  }

  const audioResponse = new Response(response.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });

  c.executionCtx.waitUntil(cache.put(cacheRequest, audioResponse.clone()));
  return audioResponse;
});

export default tts;
