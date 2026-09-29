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
	category localized
	word     localized
}

// wordList is the curated en/fr set a round's word is drawn from.
var wordList = []wordEntry{
	// Places
	{localized{"Places", "Lieux"}, localized{"Beach", "Plage"}},
	{localized{"Places", "Lieux"}, localized{"Airport", "Aéroport"}},
	{localized{"Places", "Lieux"}, localized{"Library", "Bibliothèque"}},
	{localized{"Places", "Lieux"}, localized{"Hospital", "Hôpital"}},
	{localized{"Places", "Lieux"}, localized{"Museum", "Musée"}},
	{localized{"Places", "Lieux"}, localized{"Castle", "Château"}},
	{localized{"Places", "Lieux"}, localized{"Desert", "Désert"}},
	{localized{"Places", "Lieux"}, localized{"Mountain", "Montagne"}},
	{localized{"Places", "Lieux"}, localized{"Farm", "Ferme"}},
	{localized{"Places", "Lieux"}, localized{"Subway", "Métro"}},

	// Food
	{localized{"Food", "Nourriture"}, localized{"Pizza", "Pizza"}},
	{localized{"Food", "Nourriture"}, localized{"Sushi", "Sushi"}},
	{localized{"Food", "Nourriture"}, localized{"Pancakes", "Crêpes"}},
	{localized{"Food", "Nourriture"}, localized{"Cheese", "Fromage"}},
	{localized{"Food", "Nourriture"}, localized{"Soup", "Soupe"}},
	{localized{"Food", "Nourriture"}, localized{"Baguette", "Baguette"}},
	{localized{"Food", "Nourriture"}, localized{"Chocolate", "Chocolat"}},
	{localized{"Food", "Nourriture"}, localized{"Popcorn", "Popcorn"}},

	// Animals
	{localized{"Animals", "Animaux"}, localized{"Penguin", "Manchot"}},
	{localized{"Animals", "Animaux"}, localized{"Elephant", "Éléphant"}},
	{localized{"Animals", "Animaux"}, localized{"Octopus", "Poulpe"}},
	{localized{"Animals", "Animaux"}, localized{"Kangaroo", "Kangourou"}},
	{localized{"Animals", "Animaux"}, localized{"Owl", "Hibou"}},
	{localized{"Animals", "Animaux"}, localized{"Squirrel", "Écureuil"}},
	{localized{"Animals", "Animaux"}, localized{"Shark", "Requin"}},

	// Objects
	{localized{"Objects", "Objets"}, localized{"Umbrella", "Parapluie"}},
	{localized{"Objects", "Objets"}, localized{"Telescope", "Télescope"}},
	{localized{"Objects", "Objets"}, localized{"Backpack", "Sac à dos"}},
	{localized{"Objects", "Objets"}, localized{"Candle", "Bougie"}},
	{localized{"Objects", "Objets"}, localized{"Compass", "Boussole"}},
	{localized{"Objects", "Objets"}, localized{"Mirror", "Miroir"}},
	{localized{"Objects", "Objets"}, localized{"Suitcase", "Valise"}},

	// Activities
	{localized{"Activities", "Activités"}, localized{"Camping", "Camping"}},
	{localized{"Activities", "Activités"}, localized{"Karaoke", "Karaoké"}},
	{localized{"Activities", "Activités"}, localized{"Painting", "Peinture"}},
	{localized{"Activities", "Activités"}, localized{"Fishing", "Pêche"}},
	{localized{"Activities", "Activités"}, localized{"Juggling", "Jonglerie"}},
	{localized{"Activities", "Activités"}, localized{"Skiing", "Ski"}},

	// Jobs
	{localized{"Jobs", "Métiers"}, localized{"Firefighter", "Pompier"}},
	{localized{"Jobs", "Métiers"}, localized{"Teacher", "Enseignant"}},
	{localized{"Jobs", "Métiers"}, localized{"Pilot", "Pilote"}},
	{localized{"Jobs", "Métiers"}, localized{"Chef", "Chef cuisinier"}},
	{localized{"Jobs", "Métiers"}, localized{"Plumber", "Plombier"}},

	// Weather
	{localized{"Weather", "Météo"}, localized{"Thunderstorm", "Orage"}},
	{localized{"Weather", "Météo"}, localized{"Rainbow", "Arc-en-ciel"}},
	{localized{"Weather", "Météo"}, localized{"Fog", "Brouillard"}},
	{localized{"Weather", "Météo"}, localized{"Snowstorm", "Tempête de neige"}},
}

func pickWord() wordEntry {
	return wordList[rand.IntN(len(wordList))]
}
