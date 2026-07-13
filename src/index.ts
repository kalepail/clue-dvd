import { Hono } from "hono";
import { cors } from "hono/cors";

// Route modules
import info from "./routes/info";
import gameElements from "./routes/game-elements";
import symbols from "./routes/symbols";
import setup from "./routes/setup";
import scenarios from "./routes/scenarios";
import tts from "./routes/tts";
import phone from "./phone/routes";
export { PhoneSessionHub } from "./phone/session-hub";

const app = new Hono<{ Bindings: CloudflareBindings }>();

// Enable CORS for all routes
app.use("/*", cors());

// Mount routes
app.route("/", info);
app.route("/api", gameElements);
app.route("/api/symbols", symbols);
app.route("/api/setup", setup);
app.route("/api/scenarios", scenarios);
app.route("/api", tts);
app.route("/api/phone", phone);

export default app;
