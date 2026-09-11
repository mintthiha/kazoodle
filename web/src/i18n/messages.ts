// The message catalogue and the pure lookup function. No React here, so it can
// be imported and tested on its own. The provider/hook live in ./index.

export type Locale = "en" | "fr";

type Vars = Record<string, string | number>;

const en = {
  "app.title": "Party Games",
  "app.language": "Language",

  "conn.connecting": "Connecting…",
  "conn.reconnecting": "Connection lost — reconnecting…",
  "conn.closed": "Disconnected",

  "join.heading": "Join a game",
  "join.nameLabel": "Your name",
  "join.namePlaceholder": "e.g. Alex",
  "join.createButton": "Create a room",
  "join.or": "or",
  "join.codeLabel": "Room code",
  "join.codePlaceholder": "4 letters",
  "join.joinButton": "Join",
  "join.nameRequired": "Enter your name first.",
  "join.codeRequired": "Enter a room code.",

  "lobby.heading": "Lobby",
  "lobby.roomCode": "Room code",
  "lobby.players": "Players",
  "lobby.you": "you",
  "lobby.leaveButton": "Leave",
  "lobby.echoLabel": "Send a test message",
  "lobby.echoPlaceholder": "Type something",
  "lobby.echoButton": "Send",
  "lobby.echoLast": "{who} sent: “{text}”",
  "lobby.echoNone": "No messages yet.",
  "lobby.echoFromYou": "You",
  "lobby.echoFromOther": "Someone",
  "lobby.startImposter": "Start Imposter",
  "lobby.needPlayers": "Need at least {min} players to start.",

  "game.unknown": "This game isn’t available in your app version.",

  "imposter.heading": "Your role",
  "imposter.dealing": "Dealing roles…",
  "imposter.youAreImposter": "You’re the IMPOSTER",
  "imposter.imposterHint": "You don’t know the word. Give a vague clue and blend in.",
  "imposter.crewHint": "Give a one-word clue that proves you know it — without giving it away.",
  "imposter.gotIt": "Got it",
  "imposter.waiting": "Waiting for the others…",
  "imposter.readyCount": "{ready} / {total} ready",

  "error.room_not_found": "No room with that code.",
  "error.generic": "Something went wrong.",
} satisfies Record<string, string>;

export type MessageKey = keyof typeof en;

const fr: Record<MessageKey, string> = {
  "app.title": "Party Games",
  "app.language": "Langue",

  "conn.connecting": "Connexion…",
  "conn.reconnecting": "Connexion perdue — reconnexion…",
  "conn.closed": "Déconnecté",

  "join.heading": "Rejoindre une partie",
  "join.nameLabel": "Votre nom",
  "join.namePlaceholder": "ex. Alex",
  "join.createButton": "Créer un salon",
  "join.or": "ou",
  "join.codeLabel": "Code du salon",
  "join.codePlaceholder": "4 lettres",
  "join.joinButton": "Rejoindre",
  "join.nameRequired": "Entrez d’abord votre nom.",
  "join.codeRequired": "Entrez un code de salon.",

  "lobby.heading": "Salon",
  "lobby.roomCode": "Code du salon",
  "lobby.players": "Joueurs",
  "lobby.you": "vous",
  "lobby.leaveButton": "Quitter",
  "lobby.echoLabel": "Envoyer un message test",
  "lobby.echoPlaceholder": "Écrivez quelque chose",
  "lobby.echoButton": "Envoyer",
  "lobby.echoLast": "{who} a envoyé : « {text} »",
  "lobby.echoNone": "Aucun message pour l’instant.",
  "lobby.echoFromYou": "Vous",
  "lobby.echoFromOther": "Quelqu’un",
  "lobby.startImposter": "Lancer Imposteur",
  "lobby.needPlayers": "Il faut au moins {min} joueurs pour commencer.",

  "game.unknown": "Ce jeu n’est pas disponible dans votre version.",

  "imposter.heading": "Votre rôle",
  "imposter.dealing": "Distribution des rôles…",
  "imposter.youAreImposter": "Vous êtes l’IMPOSTEUR",
  "imposter.imposterHint": "Vous ne connaissez pas le mot. Donnez un indice vague et faites semblant.",
  "imposter.crewHint": "Donnez un indice d’un mot qui prouve que vous le savez — sans le révéler.",
  "imposter.gotIt": "Compris",
  "imposter.waiting": "En attente des autres…",
  "imposter.readyCount": "{ready} / {total} prêts",

  "error.room_not_found": "Aucun salon avec ce code.",
  "error.generic": "Une erreur est survenue.",
};

const dictionaries: Record<Locale, Record<MessageKey, string>> = { en, fr };

/** Pick a starting locale from the browser, defaulting to English. */
export function detectLocale(): Locale {
  if (typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("fr")) {
    return "fr";
  }
  return "en";
}

/** Look up a key, fall back to English, then to the key itself. Substitutes
 * {name} placeholders from vars. */
export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const template = dictionaries[locale][key] ?? en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

export type { Vars };
