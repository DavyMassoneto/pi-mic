export function joinParts(parts: readonly string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

export function combine(committed: string, pending: string): string {
  return [committed, pending].filter(Boolean).join(" ");
}
