import type { ServerResponse } from "node:http";
import { loadConfig } from "../../../config/mic-config.ts";
import type { ClientConfig } from "../../../core/protocol.ts";
import { sendJson } from "../json-response.ts";

export function handleConfig(agentDir: string, res: ServerResponse): void {
  const body: ClientConfig = { realtime: !!loadConfig(agentDir).realtime };
  sendJson(res, 200, body);
}
