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

// wordList is a small bundled set. A fuller, curated en/fr list lands in a
// later slice.
var wordList = []wordEntry{
	{localized{"Places", "Lieux"}, localized{"Beach", "Plage"}},
	{localized{"Places", "Lieux"}, localized{"Airport", "Aéroport"}},
	{localized{"Places", "Lieux"}, localized{"Library", "Bibliothèque"}},
	{localized{"Food", "Nourriture"}, localized{"Pizza", "Pizza"}},
	{localized{"Food", "Nourriture"}, localized{"Sushi", "Sushi"}},
	{localized{"Food", "Nourriture"}, localized{"Pancakes", "Crêpes"}},
	{localized{"Animals", "Animaux"}, localized{"Penguin", "Manchot"}},
	{localized{"Animals", "Animaux"}, localized{"Elephant", "Éléphant"}},
	{localized{"Objects", "Objets"}, localized{"Umbrella", "Parapluie"}},
	{localized{"Objects", "Objets"}, localized{"Telescope", "Télescope"}},
	{localized{"Activities", "Activités"}, localized{"Camping", "Camping"}},
	{localized{"Activities", "Activités"}, localized{"Karaoke", "Karaoké"}},
}

func pickWord() wordEntry {
	return wordList[rand.IntN(len(wordList))]
}
