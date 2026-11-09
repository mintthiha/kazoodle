import { CategoryForm } from "../CategoryForm";
import { boardOf } from "./rows";
import type { LocalEvent, LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  dispatch: (event: LocalEvent) => void;
}

// The Psychic holds the phone and names the next category.
export function CategoryView({ game, dispatch }: Props) {
  return (
    <CategoryForm
      psychic={game.names[game.round.psychic]}
      board={boardOf(game)}
      onAsk={(text) => dispatch({ type: "setCategory", text })}
    />
  );
}
