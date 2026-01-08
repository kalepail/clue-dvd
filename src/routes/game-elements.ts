import { Hono } from "hono";
import {
  SUSPECTS,
  ITEMS,
  LOCATIONS,
  TIME_PERIODS,
  MYSTERY_THEMES,
} from "../services/scenario-generator";
import { NPCS } from "../data/game-constants";

const gameElements = new Hono<{ Bindings: CloudflareBindings }>();

// Suspects
gameElements.get("/suspects", (c) => {
  return c.json({
    count: SUSPECTS.length,
    suspects: SUSPECTS,
  });
});

gameElements.get("/suspects/:id", (c) => {
  const id = c.req.param("id");
  const suspect = SUSPECTS.find((s) => s.id === id);
  if (!suspect) {
    return c.json({ error: "Suspect not found" }, 404);
  }
  return c.json(suspect);
});

// Items
gameElements.get("/items", (c) => {
  const category = c.req.query("category");
  let items = ITEMS;
  if (category) {
    items = ITEMS.filter((i) => i.category === category);
  }
  return c.json({
    count: items.length,
    items,
  });
});

gameElements.get("/items/:id", (c) => {
  const id = c.req.param("id");
  const item = ITEMS.find((i) => i.id === id);
  if (!item) {
    return c.json({ error: "Item not found" }, 404);
  }
  return c.json(item);
});

// Locations
gameElements.get("/locations", (c) => {
  const type = c.req.query("type");
  let locations = LOCATIONS;
  if (type) {
    locations = LOCATIONS.filter((l) => l.type === type);
  }
  return c.json({
    count: locations.length,
    locations,
  });
});

gameElements.get("/locations/:id", (c) => {
  const id = c.req.param("id");
  const location = LOCATIONS.find((l) => l.id === id);
  if (!location) {
    return c.json({ error: "Location not found" }, 404);
  }
  return c.json(location);
});

// Times
gameElements.get("/times", (c) => {
  const lightCondition = c.req.query("light");
  let times = TIME_PERIODS;
  if (lightCondition) {
    times = TIME_PERIODS.filter((t) => t.lightCondition === lightCondition);
  }
  return c.json({
    count: times.length,
    times,
  });
});

gameElements.get("/times/:id", (c) => {
  const id = c.req.param("id");
  const time = TIME_PERIODS.find((t) => t.id === id);
  if (!time) {
    return c.json({ error: "Time period not found" }, 404);
  }
  return c.json(time);
});

// Themes
gameElements.get("/themes", (c) => {
  return c.json({
    count: MYSTERY_THEMES.length,
    themes: MYSTERY_THEMES,
  });
});

gameElements.get("/themes/:id", (c) => {
  const id = c.req.param("id");
  const theme = MYSTERY_THEMES.find((t) => t.id === id);
  if (!theme) {
    return c.json({ error: "Theme not found" }, 404);
  }
  return c.json(theme);
});

// NPCs
gameElements.get("/npcs", (c) => {
  return c.json({
    count: NPCS.length,
    npcs: NPCS,
  });
});

gameElements.get("/npcs/:id", (c) => {
  const id = c.req.param("id");
  const npc = NPCS.find((n) => n.id === id);
  if (!npc) {
    return c.json({ error: "NPC not found" }, 404);
  }
  return c.json(npc);
});

export default gameElements;
