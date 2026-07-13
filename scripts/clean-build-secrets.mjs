import { rmSync } from "node:fs";

// The Cloudflare Vite output mirrors .dev.vars for local preview. It is never
// needed in a distributable artifact and may contain developer credentials.
rmSync(new URL("../dist/clue_dvd/.dev.vars", import.meta.url), { force: true });
