import http from "node:http";

interface ProcessWithHandles {
  _getActiveHandles(): unknown[];
}

export function findListeningHttpServers(): http.Server[] {
  return (process as unknown as ProcessWithHandles)
    ._getActiveHandles()
    .filter((handle): handle is http.Server => handle instanceof http.Server && handle.listening);
}
