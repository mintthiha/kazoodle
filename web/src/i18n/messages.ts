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

  "home.tagline": "Party games for however your group is arranged.",
  "home.players": "{min}+ players",
  "home.soonTitle": "More games soon",
  "home.soonBody": "The next one lands right here.",
  "nav.allGames": "All games",

  "game.imposter.name": "Imposter",
  "game.imposter.hook": "Everyone gets the same word. Except one of you.",
  "game.imposter.length": "About 5 minutes",

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
  "lobby.copyCode": "Copy code",
  "lobby.codeCopied": "Copied!",
  "lobby.copyFailed": "Couldn’t copy — read the code out instead.",
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
  "lobby.hintsToggle": "Give the imposter a hint",
  "lobby.categoryLabel": "Category",
  "lobby.categoryChosen": "Category: {category}",
  "lobby.roundsLabel": "Match length",
  "lobby.roundsOption": "{n} rounds",
  "lobby.roundsChosen": "Match length: {n} rounds",

  "imposter.category.any": "Any category",
  "imposter.category.places": "Places",
  "imposter.category.food": "Food",
  "imposter.category.animals": "Animals",
  "imposter.category.objects": "Objects",
  "imposter.category.activities": "Activities",
  "imposter.category.jobs": "Jobs",
  "imposter.category.weather": "Weather",

  "game.unknown": "This game isn’t available in your app version.",

  "room.playerLeft": "{who} left.",
  "gameEnd.player_left": "Too few players left — the round was abandoned.",
  "gameEnd.imposter_left": "The imposter left — the round was abandoned.",
  "gameEnd.generic": "The round ended.",

  "imposter.heading": "Your role",
  "imposter.roundOf": "Round {round} of {total}",
  "imposter.dealing": "Dealing roles…",
  "imposter.youAreImposter": "You’re the IMPOSTER",
  "imposter.categoryLabel": "Category: {category}",
  "imposter.imposterHint": "You don’t know the word. Give a vague clue and blend in.",
  "imposter.imposterHintText": "Hint: {hint}. You still don’t know the word.",
  "imposter.crewHint": "Give a one-word clue that proves you know it — without giving it away.",
  "imposter.gotIt": "Got it",
  "imposter.waiting": "Waiting for the others…",
  "imposter.readyCount": "{ready} / {total} ready",

  "imposter.nameLeft": "{name} (left)",
  "imposter.nameGone": "a player who left",

  "imposter.cluesHeading": "Clues",
  "imposter.clueProgress": "Clue {turn} of {total}",
  "imposter.yourClueLabel": "Your clue",
  "imposter.yourCluePlaceholder": "One word",
  "imposter.submitClue": "Submit",
  "imposter.waitingForClue": "Waiting for {who}…",

  "imposter.voteHeading": "Who's the imposter?",
  "imposter.voteProgress": "{voted} / {total} voted",
  "imposter.abstain": "Abstain",
  "imposter.lockIn": "Lock in",
  "imposter.changeVote": "Change vote",
  "imposter.voteLockedIn": "Locked in: {who}",
  "imposter.voteTimeLeft": "{seconds}s left to decide",
  "imposter.voteTimeUp": "Time's up — your pick was locked in.",
  "imposter.ballotReopened": "Someone left, so the ballot changed. Pick again.",

  "imposter.stealHeading": "Caught!",
  "imposter.stealHintImposter": "You were caught — but you get one guess at the word to steal the win.",
  "imposter.stealHintOther": "{who} was caught. They get one guess at the word to steal the win back.",
  "imposter.stealGuessLabel": "Your guess",
  "imposter.stealGuessPlaceholder": "The secret word",
  "imposter.stealSubmit": "Guess",
  "imposter.stealWaiting": "Waiting for {who} to guess…",

  "imposter.outcomeHeading": "Results",
  "imposter.crewWon": "The crew wins!",
  "imposter.imposterWon": "The imposter wins!",
  "imposter.revealImposter": "The imposter was {who}.",
  "imposter.revealWord": "The word was “{word}” ({category}).",
  "imposter.revealHint": "The imposter's hint was “{hint}”.",
  "imposter.votedOut": "{who} was voted out.",
  "imposter.noOneVotedOut": "The vote was tied — no one was voted out.",
  "imposter.stealSucceeded": "{who} guessed “{guess}” — exactly right. Stolen!",
  "imposter.stealFailed": "{who} guessed “{guess}” — not quite.",
  "imposter.votesHeading": "Votes",
  "imposter.scoresHeading": "Standings",
  "imposter.scoreDelta": "+{delta} this round",
  "imposter.scoring": "Catch the imposter: +1 each. Imposter escapes: +2. Caught imposter guesses the word: +3.",
  "imposter.finalHeading": "Final standings",
  "imposter.matchWinner": "{who} wins the match!",
  "imposter.matchWinnersTie": "It’s a draw — {who} share the win.",
  "imposter.matchNoWinner": "Nobody scored. Somehow.",
  "imposter.nextRound": "Next round",
  "imposter.finishMatch": "Finish",
  "imposter.waitingForNextRound": "Waiting for the host to start the next round…",
  "imposter.waitingForFinish": "Waiting for the host to wrap up…",

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

  "home.tagline": "Des jeux de soirée, peu importe comment votre groupe est installé.",
  "home.players": "{min}+ joueurs",
  "home.soonTitle": "D’autres jeux bientôt",
  "home.soonBody": "Le prochain apparaîtra ici.",
  "nav.allGames": "Tous les jeux",

  "game.imposter.name": "Imposteur",
  "game.imposter.hook": "Tout le monde reçoit le même mot. Sauf l’un de vous.",
  "game.imposter.length": "Environ 5 minutes",

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
  "lobby.copyCode": "Copier le code",
  "lobby.codeCopied": "Copié !",
  "lobby.copyFailed": "Copie impossible — lisez le code à voix haute.",
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
  "lobby.hintsToggle": "Donner un indice à l’imposteur",
  "lobby.categoryLabel": "Catégorie",
  "lobby.categoryChosen": "Catégorie : {category}",
  "lobby.roundsLabel": "Durée de la partie",
  "lobby.roundsOption": "{n} manches",
  "lobby.roundsChosen": "Durée de la partie : {n} manches",

  "imposter.category.any": "Toutes catégories",
  "imposter.category.places": "Lieux",
  "imposter.category.food": "Nourriture",
  "imposter.category.animals": "Animaux",
  "imposter.category.objects": "Objets",
  "imposter.category.activities": "Activités",
  "imposter.category.jobs": "Métiers",
  "imposter.category.weather": "Météo",

  "game.unknown": "Ce jeu n’est pas disponible dans votre version.",

  "room.playerLeft": "{who} a quitté la partie.",
  "gameEnd.player_left": "Trop peu de joueurs — la manche a été abandonnée.",
  "gameEnd.imposter_left": "L’imposteur a quitté la partie — la manche a été abandonnée.",
  "gameEnd.generic": "La manche est terminée.",

  "imposter.heading": "Votre rôle",
  "imposter.roundOf": "Manche {round} sur {total}",
  "imposter.dealing": "Distribution des rôles…",
  "imposter.youAreImposter": "Vous êtes l’IMPOSTEUR",
  "imposter.categoryLabel": "Catégorie : {category}",
  "imposter.imposterHint": "Vous ne connaissez pas le mot. Donnez un indice vague et faites semblant.",
  "imposter.imposterHintText": "Indice : {hint}. Vous ne connaissez toujours pas le mot.",
  "imposter.crewHint": "Donnez un indice d’un mot qui prouve que vous le savez — sans le révéler.",
  "imposter.gotIt": "Compris",
  "imposter.waiting": "En attente des autres…",
  "imposter.readyCount": "{ready} / {total} prêts",

  "imposter.nameLeft": "{name} (a quitté)",
  "imposter.nameGone": "une personne partie",

  "imposter.cluesHeading": "Indices",
  "imposter.clueProgress": "Indice {turn} sur {total}",
  "imposter.yourClueLabel": "Votre indice",
  "imposter.yourCluePlaceholder": "Un mot",
  "imposter.submitClue": "Envoyer",
  "imposter.waitingForClue": "En attente de {who}…",

  "imposter.voteHeading": "Qui est l’imposteur ?",
  "imposter.voteProgress": "{voted} / {total} ont voté",
  "imposter.abstain": "S’abstenir",
  "imposter.lockIn": "Verrouiller",
  "imposter.changeVote": "Changer de vote",
  "imposter.voteLockedIn": "Verrouillé : {who}",
  "imposter.voteTimeLeft": "{seconds} s pour décider",
  "imposter.voteTimeUp": "Temps écoulé — votre choix a été verrouillé.",
  "imposter.ballotReopened": "Quelqu’un a quitté la partie, donc le vote a changé. Choisissez à nouveau.",

  "imposter.stealHeading": "Démasqué !",
  "imposter.stealHintImposter": "Vous avez été démasqué — mais vous avez une chance de deviner le mot pour voler la victoire.",
  "imposter.stealHintOther": "{who} a été démasqué. Une dernière chance de deviner le mot pour voler la victoire.",
  "imposter.stealGuessLabel": "Votre réponse",
  "imposter.stealGuessPlaceholder": "Le mot secret",
  "imposter.stealSubmit": "Deviner",
  "imposter.stealWaiting": "En attente de la réponse de {who}…",

  "imposter.outcomeHeading": "Résultats",
  "imposter.crewWon": "L’équipe gagne !",
  "imposter.imposterWon": "L’imposteur gagne !",
  "imposter.revealImposter": "L’imposteur était {who}.",
  "imposter.revealWord": "Le mot était « {word} » ({category}).",
  "imposter.revealHint": "L’indice de l’imposteur était « {hint} ».",
  "imposter.votedOut": "{who} a été exclu(e) par le vote.",
  "imposter.noOneVotedOut": "Le vote était à égalité — personne n’a été exclu(e).",
  "imposter.stealSucceeded": "{who} a deviné « {guess} » — en plein dans le mille. Volé !",
  "imposter.stealFailed": "{who} a deviné « {guess} » — pas tout à fait.",
  "imposter.votesHeading": "Votes",
  "imposter.scoresHeading": "Classement",
  "imposter.scoreDelta": "+{delta} cette manche",
  "imposter.scoring": "Démasquer l’imposteur : +1 chacun. L’imposteur s’échappe : +2. L’imposteur démasqué devine le mot : +3.",
  "imposter.finalHeading": "Classement final",
  "imposter.matchWinner": "{who} gagne la partie !",
  "imposter.matchWinnersTie": "Match nul — {who} se partagent la victoire.",
  "imposter.matchNoWinner": "Personne n’a marqué. Allez savoir.",
  "imposter.nextRound": "Manche suivante",
  "imposter.finishMatch": "Terminer",
  "imposter.waitingForNextRound": "En attente que l’hôte lance la manche suivante…",
  "imposter.waitingForFinish": "En attente que l’hôte termine la partie…",

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
