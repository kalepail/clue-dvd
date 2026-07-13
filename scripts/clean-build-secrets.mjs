import { existsSync, readdirSync, rmSync } from "node:fs";

const distDirectory = new URL("../dist/", import.meta.url);

function removeSecretArtifacts(directory) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryUrl = new URL(entry.name, directory);
    if (entry.isDirectory()) {
      removeSecretArtifacts(new URL(`${entry.name}/`, directory));
    } else if (entry.name === ".dev.vars" || entry.name.startsWith(".dev.vars.")) {
      rmSync(entryUrl, { force: true });
    }
  }
}

removeSecretArtifacts(distDirectory);
