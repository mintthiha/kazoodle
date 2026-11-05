import { useT } from "../../../i18n";
import { Avatar } from "../../../players/Avatar";
import { makeSeatHue } from "../../onephone/seatHue";
import { clueGivers, type LocalGame } from "./localGame";

interface Props {
  game: LocalGame;
  onBegin: () => void;
}

// The phone is on the table and everyone can see it: who is the Psychic this
// round, who the Clue Givers are, and how the number is about to be decided.
export function IntroView({ game, onBegin }: Props) {
  const { t } = useT();
  const { names, round, settings } = game;
  const givers = clueGivers(game);
  const hue = makeSeatHue(names.length);
  const psychic = names[round.psychic];

  return (
    <main className="screen">
      <h1 className="wl-headline">{t("wl.introHeading", { who: psychic })}</h1>
      <p className="wl-lead">
        {settings.secret === "random"
          ? t("wl.introRandom", { who: psychic })
          : t("wl.introChosen", { who: psychic, first: names[givers[0]] })}
      </p>

      <section>
        <h2>{t("wl.giversHeading")}</h2>
        <ul className="roster">
          {givers.map((seat) => (
            <li key={seat} className="roster-row">
              <Avatar name={names[seat]} hue={hue(seat)} />
              <span className="roster-name">{names[seat]}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="dock">
        <button className="primary" onClick={onBegin}>
          {t("wl.begin")}
        </button>
      </div>
    </main>
  );
}
