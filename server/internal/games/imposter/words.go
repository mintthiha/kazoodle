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

// wordEntry is one secret-word option: the word plus the category it belongs to.
type wordEntry struct {
	categoryKey string // stable, locale-independent id — see StartOptions.category
	category    localized
	word        localized
}

// wordList is the curated en/fr set a round's word is drawn from. The
// category keys here ("places", "food", ...) are the single source of truth
// for what StartOptions.category accepts — the web client's category picker
// (web/src/games/imposter/categories.ts) must list the same keys.
var wordList = []wordEntry{
	// Places
	{"places", localized{"Places", "Lieux"}, localized{"Beach", "Plage"}},
	{"places", localized{"Places", "Lieux"}, localized{"Airport", "Aéroport"}},
	{"places", localized{"Places", "Lieux"}, localized{"Library", "Bibliothèque"}},
	{"places", localized{"Places", "Lieux"}, localized{"Hospital", "Hôpital"}},
	{"places", localized{"Places", "Lieux"}, localized{"Museum", "Musée"}},
	{"places", localized{"Places", "Lieux"}, localized{"Castle", "Château"}},
	{"places", localized{"Places", "Lieux"}, localized{"Desert", "Désert"}},
	{"places", localized{"Places", "Lieux"}, localized{"Mountain", "Montagne"}},
	{"places", localized{"Places", "Lieux"}, localized{"Farm", "Ferme"}},
	{"places", localized{"Places", "Lieux"}, localized{"Subway", "Métro"}},

	// Food
	{"food", localized{"Food", "Nourriture"}, localized{"Pizza", "Pizza"}},
	{"food", localized{"Food", "Nourriture"}, localized{"Sushi", "Sushi"}},
	{"food", localized{"Food", "Nourriture"}, localized{"Pancakes", "Crêpes"}},
	{"food", localized{"Food", "Nourriture"}, localized{"Cheese", "Fromage"}},
	{"food", localized{"Food", "Nourriture"}, localized{"Soup", "Soupe"}},
	{"food", localized{"Food", "Nourriture"}, localized{"Baguette", "Baguette"}},
	{"food", localized{"Food", "Nourriture"}, localized{"Chocolate", "Chocolat"}},
	{"food", localized{"Food", "Nourriture"}, localized{"Popcorn", "Popcorn"}},

	// Animals
	{"animals", localized{"Animals", "Animaux"}, localized{"Penguin", "Manchot"}},
	{"animals", localized{"Animals", "Animaux"}, localized{"Elephant", "Éléphant"}},
	{"animals", localized{"Animals", "Animaux"}, localized{"Octopus", "Poulpe"}},
	{"animals", localized{"Animals", "Animaux"}, localized{"Kangaroo", "Kangourou"}},
	{"animals", localized{"Animals", "Animaux"}, localized{"Owl", "Hibou"}},
	{"animals", localized{"Animals", "Animaux"}, localized{"Squirrel", "Écureuil"}},
	{"animals", localized{"Animals", "Animaux"}, localized{"Shark", "Requin"}},

	// Objects
	{"objects", localized{"Objects", "Objets"}, localized{"Umbrella", "Parapluie"}},
	{"objects", localized{"Objects", "Objets"}, localized{"Telescope", "Télescope"}},
	{"objects", localized{"Objects", "Objets"}, localized{"Backpack", "Sac à dos"}},
	{"objects", localized{"Objects", "Objets"}, localized{"Candle", "Bougie"}},
	{"objects", localized{"Objects", "Objets"}, localized{"Compass", "Boussole"}},
	{"objects", localized{"Objects", "Objets"}, localized{"Mirror", "Miroir"}},
	{"objects", localized{"Objects", "Objets"}, localized{"Suitcase", "Valise"}},

	// Activities
	{"activities", localized{"Activities", "Activités"}, localized{"Camping", "Camping"}},
	{"activities", localized{"Activities", "Activités"}, localized{"Karaoke", "Karaoké"}},
	{"activities", localized{"Activities", "Activités"}, localized{"Painting", "Peinture"}},
	{"activities", localized{"Activities", "Activités"}, localized{"Fishing", "Pêche"}},
	{"activities", localized{"Activities", "Activités"}, localized{"Juggling", "Jonglerie"}},
	{"activities", localized{"Activities", "Activités"}, localized{"Skiing", "Ski"}},

	// Jobs
	{"jobs", localized{"Jobs", "Métiers"}, localized{"Firefighter", "Pompier"}},
	{"jobs", localized{"Jobs", "Métiers"}, localized{"Teacher", "Enseignant"}},
	{"jobs", localized{"Jobs", "Métiers"}, localized{"Pilot", "Pilote"}},
	{"jobs", localized{"Jobs", "Métiers"}, localized{"Chef", "Chef cuisinier"}},
	{"jobs", localized{"Jobs", "Métiers"}, localized{"Plumber", "Plombier"}},

	// Weather
	{"weather", localized{"Weather", "Météo"}, localized{"Thunderstorm", "Orage"}},
	{"weather", localized{"Weather", "Météo"}, localized{"Rainbow", "Arc-en-ciel"}},
	{"weather", localized{"Weather", "Météo"}, localized{"Fog", "Brouillard"}},
	{"weather", localized{"Weather", "Météo"}, localized{"Snowstorm", "Tempête de neige"}},
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
