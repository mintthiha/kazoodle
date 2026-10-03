package imposter

import "math/rand/v2"

// localized is an English/French pair for one player-facing string. Each player
// sees the rendering for their own locale.
type localized struct {
	en string
	fr string
}

func (l localized) forLocale(locale string) string {
	if locale == "fr" {
		return l.fr
	}
	return l.en
}

// wordEntry is one secret-word option. category is always public (crew and
// imposter both see it); hint is a stronger clue shown only to the imposter,
// and only when the host turns hints on — see RoleAssignment's doc comment.
//
// hint should read like a single strong association, not a definition: "Pole"
// for Firefighter, not "Puts out fires". The category already tells the
// imposter the general territory; a hint that just restates the category in
// sentence form adds nothing. A good hint names a specific, recognizable
// detail of the word that someone who knows it would nod at instantly.
type wordEntry struct {
	categoryKey string // stable, locale-independent id — see StartOptions.category
	category    localized
	word        localized
	hint        localized
}

// wordList is the curated en/fr set a round's word is drawn from. The
// category keys here ("places", "food", ...) are the single source of truth
// for what StartOptions.category accepts — the web client's category picker
// (web/src/games/imposter/categories.ts) must list the same keys.
var wordList = []wordEntry{
	// Places
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Beach", "Plage"}, hint: localized{"Sandcastle", "Château de sable"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Airport", "Aéroport"}, hint: localized{"Runway", "Piste"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Library", "Bibliothèque"}, hint: localized{"Shelves", "Étagères"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Hospital", "Hôpital"}, hint: localized{"Stretcher", "Civière"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Museum", "Musée"}, hint: localized{"Exhibit", "Exposition"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Castle", "Château"}, hint: localized{"Moat", "Douves"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Desert", "Désert"}, hint: localized{"Cactus", "Cactus"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Mountain", "Montagne"}, hint: localized{"Summit", "Sommet"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Farm", "Ferme"}, hint: localized{"Tractor", "Tracteur"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Subway", "Métro"}, hint: localized{"Turnstile", "Tourniquet"}},

	// Food
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Pizza", "Pizza"}, hint: localized{"Slice", "Part"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Sushi", "Sushi"}, hint: localized{"Chopsticks", "Baguettes"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Pancakes", "Crêpes"}, hint: localized{"Syrup", "Sirop"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Cheese", "Fromage"}, hint: localized{"Wedge", "Morceau"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Soup", "Soupe"}, hint: localized{"Ladle", "Louche"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Baguette", "Baguette"}, hint: localized{"Crust", "Croûte"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Chocolate", "Chocolat"}, hint: localized{"Cocoa", "Cacao"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Popcorn", "Popcorn"}, hint: localized{"Kernel", "Grain"}},

	// Animals
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Penguin", "Manchot"}, hint: localized{"Tuxedo", "Smoking"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Elephant", "Éléphant"}, hint: localized{"Trunk", "Trompe"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Octopus", "Poulpe"}, hint: localized{"Tentacles", "Tentacules"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Kangaroo", "Kangourou"}, hint: localized{"Pouch", "Poche"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Owl", "Hibou"}, hint: localized{"Hoot", "Hululement"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Squirrel", "Écureuil"}, hint: localized{"Acorn", "Gland"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Shark", "Requin"}, hint: localized{"Fin", "Aileron"}},

	// Objects
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Umbrella", "Parapluie"}, hint: localized{"Rain", "Pluie"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Telescope", "Télescope"}, hint: localized{"Lens", "Lentille"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Backpack", "Sac à dos"}, hint: localized{"Straps", "Bretelles"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Candle", "Bougie"}, hint: localized{"Wax", "Cire"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Compass", "Boussole"}, hint: localized{"North", "Nord"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Mirror", "Miroir"}, hint: localized{"Reflection", "Reflet"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Suitcase", "Valise"}, hint: localized{"Zipper", "Fermeture éclair"}},

	// Activities
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Camping", "Camping"}, hint: localized{"Tent", "Tente"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Karaoke", "Karaoké"}, hint: localized{"Microphone", "Microphone"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Painting", "Peinture"}, hint: localized{"Canvas", "Toile"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Fishing", "Pêche"}, hint: localized{"Bait", "Appât"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Juggling", "Jonglerie"}, hint: localized{"Balls", "Balles"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Skiing", "Ski"}, hint: localized{"Slope", "Pente"}},

	// Jobs
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Firefighter", "Pompier"}, hint: localized{"Pole", "Poteau"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Teacher", "Enseignant"}, hint: localized{"Chalkboard", "Tableau"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Pilot", "Pilote"}, hint: localized{"Cockpit", "Cabine"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Chef", "Chef cuisinier"}, hint: localized{"Apron", "Tablier"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Plumber", "Plombier"}, hint: localized{"Wrench", "Clé à molette"}},

	// Weather
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Thunderstorm", "Orage"}, hint: localized{"Lightning", "Éclair"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Rainbow", "Arc-en-ciel"}, hint: localized{"Prism", "Prisme"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Fog", "Brouillard"}, hint: localized{"Mist", "Brume"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Snowstorm", "Tempête de neige"}, hint: localized{"Blizzard", "Blizzard"}},
}

// pickWord returns a random word, restricted to categoryKey when it names a
// known category. An empty or unrecognized categoryKey draws from every word
// — see StartOptions.category's doc comment for why an unknown key is not an
// error.
func pickWord(categoryKey string) wordEntry {
	pool := wordList
	if categoryKey != "" {
		if filtered := wordsInCategory(categoryKey); len(filtered) > 0 {
			pool = filtered
		}
	}
	return pool[rand.IntN(len(pool))]
}

func wordsInCategory(categoryKey string) []wordEntry {
	var out []wordEntry
	for _, w := range wordList {
		if w.categoryKey == categoryKey {
			out = append(out, w)
		}
	}
	return out
}
