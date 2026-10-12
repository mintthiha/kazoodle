// The badge on a game's tile. Imposter gets a drawn mask; any game added later
// falls back to its own initial in the display face until it earns a mark.
interface Props {
  gameId: string;
  name: string;
}

export function GameMark({ gameId, name }: Props) {
  if (gameId === "imposter") {
    return (
      <svg className="tile-mark-art" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
        <path
          d="M4 12.5c0-2 1.6-3.5 3.6-3.5h16.8c2 0 3.6 1.5 3.6 3.5v1.9c0 4.7-3.3 8.1-7.4 8.1-2 0-3.6-.9-4.6-2.3-1 1.4-2.6 2.3-4.6 2.3C7.3 22.5 4 19.1 4 14.4v-1.9Z"
          fill="currentColor"
        />
        <circle cx="11" cy="15" r="2.4" fill="rgba(8,8,14,.72)" />
        <circle cx="21" cy="15" r="2.4" fill="rgba(8,8,14,.72)" />
      </svg>
    );
  }
  return <span className="tile-mark-letter">{name.slice(0, 1)}</span>;
}
