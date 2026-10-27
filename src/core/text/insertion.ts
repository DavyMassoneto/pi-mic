export interface Insertion {
  value: string;
  caret: number;
}

export function appendText(current: string, text: string): string {
  const separator = current === "" || /\s$/.test(current) ? "" : " ";
  return current + separator + text;
}

export function createInsertion(
  value: string,
  start: number,
  end: number,
): (text: string) => Insertion {
  const before = value.slice(0, start);
  const after = value.slice(end);
  return (text) => {
    const leading = before && text && !/\s$/.test(before) ? " " : "";
    const trailing = after && text && !/^\s/.test(after) ? " " : "";
    return {
      value: before + leading + text + trailing + after,
      caret: (before + leading + text).length,
    };
  };
}
