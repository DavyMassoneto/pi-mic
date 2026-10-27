import { DEEPGRAM_DEFAULT_MODEL, type DeepgramOptions } from "./options.ts";

type QueryOptions = Pick<DeepgramOptions, "model" | "language" | "keyterms">;

export function deepgramQuery(
  options: QueryOptions,
  extra: Record<string, string> = {},
): URLSearchParams {
  const query = new URLSearchParams({
    model: options.model || DEEPGRAM_DEFAULT_MODEL,
    smart_format: "true",
    punctuate: "true",
    ...extra,
  });
  if (options.language) query.set("language", options.language);
  for (const term of options.keyterms ?? []) query.append("keyterm", term);
  return query;
}
