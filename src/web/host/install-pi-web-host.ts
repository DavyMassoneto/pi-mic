import { attachMicHandlers } from "./attach.ts";
import { findListeningHttpServers } from "./listening-servers.ts";
import { createMicHandlers, type MicHandlerDeps } from "./mic-handlers.ts";

export function installPiWebHost(deps: MicHandlerDeps): boolean {
  const handlers = createMicHandlers(deps);
  return findListeningHttpServers()
    .map((server) => attachMicHandlers(server, handlers))
    .some(Boolean);
}
