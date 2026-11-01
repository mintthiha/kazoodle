import type { CSSProperties } from "react";

interface Props {
  name: string;
  hue: number;
}

// One person's mark: their initial on their own hue. Decorative, because the
// name is always written beside it. Spreading the name rather than indexing it
// keeps an emoji or accented first letter in one piece.
export function Avatar({ name, hue }: Props) {
  return (
    <span className="avatar" aria-hidden="true" style={{ "--hue": hue } as CSSProperties}>
      {[...name.trim()][0]?.toUpperCase() ?? "?"}
    </span>
  );
}
