import { existsSync, readdirSync } from "node:fs";

const distDirectory = new URL("../dist/", import.meta.url);
const prohibitedArtifacts = [];

function inspect(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      inspect(new URL(`${entry.name}/`, directory));
    } else if (entry.name === ".dev.vars" || entry.name.startsWith(".dev.vars.")) {
      prohibitedArtifacts.push(entry.name);
    }
  }
}

inspect(distDirectory);
if (prohibitedArtifacts.length > 0) {
  throw new Error("Build output contains prohibited local-development variable artifacts.");
}
