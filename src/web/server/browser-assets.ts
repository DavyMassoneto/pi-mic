import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { ASSET_PREFIX } from "../../core/protocol.ts";

const SERVED_ROOTS = ["core", join("web", "client")];

function listScripts(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
    .map((entry) => join(entry.parentPath, entry.name));
}

export function loadBrowserAssets(distRoot: string): Map<string, Buffer> {
  const assets = new Map<string, Buffer>();
  for (const root of SERVED_ROOTS) {
    for (const file of listScripts(join(distRoot, root))) {
      const urlPath = relative(distRoot, file).split(sep).join("/");
      assets.set(`${ASSET_PREFIX}/${urlPath}`, readFileSync(file));
    }
  }
  return assets;
}
