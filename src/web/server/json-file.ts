import { existsSync, readFileSync } from "node:fs";

export function readJsonFile<T>(path: string): T | undefined {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;
}
