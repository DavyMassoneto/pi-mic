const PI_WEB_LIVENESS_KEY = Symbol.for("@agegr/pi-web/session-liveness/v1");

export function isInsidePiWeb(): boolean {
  return typeof (globalThis as Record<symbol, unknown>)[PI_WEB_LIVENESS_KEY] === "object";
}
