import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { MicConfig } from "../config/mic-config.ts";
import type { Endpoint } from "../providers/openai-compatible/transcribe.ts";
import { listInputDevices } from "./capture/windows-devices.ts";

type RegistryContext = Pick<ExtensionContext, "modelRegistry">;

export async function resolveEndpoint(ctx: RegistryContext, config: MicConfig): Promise<Endpoint> {
  if (!config.provider) throw new Error("no provider set; run /mic setup");
  const apiKey = await ctx.modelRegistry.getApiKeyForProvider(config.provider);
  if (!apiKey) throw new Error(`no API key for provider "${config.provider}"`);
  const baseUrl =
    config.baseUrl ??
    ctx.modelRegistry.getAll().find((model) => model.provider === config.provider)?.baseUrl;
  if (!baseUrl) throw new Error(`no baseUrl for provider "${config.provider}"`);
  return { apiKey, baseUrl };
}

export async function deviceIndex(config: MicConfig): Promise<number | undefined> {
  if (!config.device) return undefined;
  const names = await listInputDevices();
  const index = names.indexOf(config.device);
  if (index < 0) throw new Error(`input device "${config.device}" not found; run /mic device`);
  return index;
}
