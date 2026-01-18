declare namespace Cloudflare {
  interface Env {
    OPENAI_API_KEY: string;
    ELEVENLABS_API_KEY: string;
    ELEVENLABS_BUTLER_VOICE_ID?: string;
    ELEVENLABS_INSPECTOR_VOICE_ID?: string;
    BUTLER_VOICE_ID?: string;
    INSPECTOR_VOICE_ID?: string;
  }
}
