package imposter

import "math/rand/v2"

// localized is an English/French pair for one player-facing string. Each player
// sees the rendering for their own locale.
type localized struct {
	en string
	fr string
}

// forms is every rendering of this string, for when the question is "did the
// player type this word in ANY language" rather than "what does this player
// see".
func (l localized) forms() []string {
	return []string{l.en, l.fr}
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
//
// When adding a word, prefer one with a single obvious form in both languages.
// A steal guess has to match (see normalizeWord, which forgives only case,
// spacing and accents), so "Bicycle" would cost an imposter who correctly typed
// "bike", and a gendered French job title would do the same. That is why the jobs here lean towards forms like
// "Dentiste" that read the same for anyone.
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
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Casino", "Casino"}, hint: localized{"Jackpot", "Jackpot"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Stadium", "Stade"}, hint: localized{"Bleachers", "Gradins"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Zoo", "Zoo"}, hint: localized{"Cage", "Cage"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Bakery", "Boulangerie"}, hint: localized{"Flour", "Farine"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Prison", "Prison"}, hint: localized{"Bars", "Barreaux"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Theater", "Théâtre"}, hint: localized{"Curtain", "Rideau"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Church", "Église"}, hint: localized{"Steeple", "Clocher"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Supermarket", "Supermarché"}, hint: localized{"Checkout", "Caisse"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Lighthouse", "Phare"}, hint: localized{"Foghorn", "Corne de brume"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Volcano", "Volcan"}, hint: localized{"Lava", "Lave"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Island", "Île"}, hint: localized{"Castaway", "Naufragé"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Forest", "Forêt"}, hint: localized{"Moss", "Mousse"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Cave", "Grotte"}, hint: localized{"Stalactite", "Stalactite"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Cemetery", "Cimetière"}, hint: localized{"Tombstone", "Pierre tombale"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Harbor", "Port"}, hint: localized{"Dock", "Quai"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Bank", "Banque"}, hint: localized{"Vault", "Coffre-fort"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"School", "École"}, hint: localized{"Recess", "Récréation"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Restaurant", "Restaurant"}, hint: localized{"Menu", "Menu"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Hotel", "Hôtel"}, hint: localized{"Concierge", "Concierge"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Pyramid", "Pyramide"}, hint: localized{"Pharaoh", "Pharaon"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Waterfall", "Cascade"}, hint: localized{"Niagara", "Niagara"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Circus", "Cirque"}, hint: localized{"Big top", "Chapiteau"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Pharmacy", "Pharmacie"}, hint: localized{"Prescription", "Ordonnance"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Aquarium", "Aquarium"}, hint: localized{"Jellyfish", "Méduse"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Attic", "Grenier"}, hint: localized{"Cobwebs", "Toiles d'araignée"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Spa", "Spa"}, hint: localized{"Massage", "Massage"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Bar", "Bar"}, hint: localized{"Stool", "Tabouret"}},
	{categoryKey: "places", category: localized{"Places", "Lieux"}, word: localized{"Vineyard", "Vignoble"}, hint: localized{"Grapes", "Raisins"}},

	// Food
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Pizza", "Pizza"}, hint: localized{"Slice", "Part"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Sushi", "Sushi"}, hint: localized{"Chopsticks", "Baguettes"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Pancakes", "Crêpes"}, hint: localized{"Syrup", "Sirop"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Cheese", "Fromage"}, hint: localized{"Wedge", "Morceau"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Soup", "Soupe"}, hint: localized{"Ladle", "Louche"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Baguette", "Baguette"}, hint: localized{"Crust", "Croûte"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Chocolate", "Chocolat"}, hint: localized{"Cocoa", "Cacao"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Popcorn", "Popcorn"}, hint: localized{"Kernel", "Grain"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Hamburger", "Hamburger"}, hint: localized{"Patty", "Galette"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Taco", "Taco"}, hint: localized{"Salsa", "Salsa"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Spaghetti", "Spaghetti"}, hint: localized{"Meatball", "Boulette"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Croissant", "Croissant"}, hint: localized{"Flaky", "Feuilleté"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Poutine", "Poutine"}, hint: localized{"Curds", "Fromage en grains"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Honey", "Miel"}, hint: localized{"Beehive", "Ruche"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Banana", "Banane"}, hint: localized{"Peel", "Peau"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Pineapple", "Ananas"}, hint: localized{"Crown", "Couronne"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Strawberry", "Fraise"}, hint: localized{"Jam", "Confiture"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Lemon", "Citron"}, hint: localized{"Sour", "Acide"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Avocado", "Avocat"}, hint: localized{"Guacamole", "Guacamole"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Bacon", "Bacon"}, hint: localized{"Sizzle", "Grésillement"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Egg", "Œuf"}, hint: localized{"Yolk", "Jaune"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Salad", "Salade"}, hint: localized{"Dressing", "Vinaigrette"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Cake", "Gâteau"}, hint: localized{"Candles", "Bougies"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Waffle", "Gaufre"}, hint: localized{"Grid", "Quadrillage"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Lobster", "Homard"}, hint: localized{"Claws", "Pinces"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Steak", "Steak"}, hint: localized{"Medium rare", "Saignant"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Pretzel", "Bretzel"}, hint: localized{"Knot", "Nœud"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Mustard", "Moutarde"}, hint: localized{"Dijon", "Dijon"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Garlic", "Ail"}, hint: localized{"Vampire", "Vampire"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Onion", "Oignon"}, hint: localized{"Tears", "Larmes"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Mushroom", "Champignon"}, hint: localized{"Spores", "Spores"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Pumpkin", "Citrouille"}, hint: localized{"Halloween", "Halloween"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Coffee", "Café"}, hint: localized{"Barista", "Barista"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Beer", "Bière"}, hint: localized{"Foam", "Mousse"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Wine", "Vin"}, hint: localized{"Cork", "Bouchon"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Nachos", "Nachos"}, hint: localized{"Jalapeño", "Jalapeño"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Lasagna", "Lasagne"}, hint: localized{"Layers", "Couches"}},
	{categoryKey: "food", category: localized{"Food", "Nourriture"}, word: localized{"Sandwich", "Sandwich"}, hint: localized{"Deli", "Charcuterie"}},

	// Animals
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Penguin", "Manchot"}, hint: localized{"Tuxedo", "Smoking"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Elephant", "Éléphant"}, hint: localized{"Trunk", "Trompe"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Octopus", "Poulpe"}, hint: localized{"Tentacles", "Tentacules"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Kangaroo", "Kangourou"}, hint: localized{"Pouch", "Poche"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Owl", "Hibou"}, hint: localized{"Hoot", "Hululement"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Squirrel", "Écureuil"}, hint: localized{"Acorn", "Gland"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Shark", "Requin"}, hint: localized{"Fin", "Aileron"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Giraffe", "Girafe"}, hint: localized{"Neck", "Cou"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Lion", "Lion"}, hint: localized{"Mane", "Crinière"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Tiger", "Tigre"}, hint: localized{"Stripes", "Rayures"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Zebra", "Zèbre"}, hint: localized{"Crosswalk", "Passage piéton"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Monkey", "Singe"}, hint: localized{"Banana", "Banane"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Snake", "Serpent"}, hint: localized{"Venom", "Venin"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Crocodile", "Crocodile"}, hint: localized{"Swamp", "Marécage"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Frog", "Grenouille"}, hint: localized{"Lily pad", "Nénuphar"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Turtle", "Tortue"}, hint: localized{"Shell", "Carapace"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Rabbit", "Lapin"}, hint: localized{"Carrot", "Carotte"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Bear", "Ours"}, hint: localized{"Hibernation", "Hibernation"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Wolf", "Loup"}, hint: localized{"Pack", "Meute"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Fox", "Renard"}, hint: localized{"Burrow", "Terrier"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Beaver", "Castor"}, hint: localized{"Dam", "Barrage"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Dolphin", "Dauphin"}, hint: localized{"Sonar", "Sonar"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Whale", "Baleine"}, hint: localized{"Krill", "Krill"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Bee", "Abeille"}, hint: localized{"Stinger", "Dard"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Butterfly", "Papillon"}, hint: localized{"Cocoon", "Cocon"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Spider", "Araignée"}, hint: localized{"Web", "Toile"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Parrot", "Perroquet"}, hint: localized{"Pirate", "Pirate"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Peacock", "Paon"}, hint: localized{"Feathers", "Plumes"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Hedgehog", "Hérisson"}, hint: localized{"Spines", "Piquants"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Camel", "Chameau"}, hint: localized{"Hump", "Bosse"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Panda", "Panda"}, hint: localized{"Bamboo", "Bambou"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Koala", "Koala"}, hint: localized{"Eucalyptus", "Eucalyptus"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Sheep", "Mouton"}, hint: localized{"Wool", "Laine"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Cow", "Vache"}, hint: localized{"Milk", "Lait"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Pig", "Cochon"}, hint: localized{"Mud", "Boue"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Horse", "Cheval"}, hint: localized{"Saddle", "Selle"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Cat", "Chat"}, hint: localized{"Litter", "Litière"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Dog", "Chien"}, hint: localized{"Leash", "Laisse"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Jellyfish", "Méduse"}, hint: localized{"Sting", "Piqûre"}},
	{categoryKey: "animals", category: localized{"Animals", "Animaux"}, word: localized{"Snail", "Escargot"}, hint: localized{"Slime", "Bave"}},

	// Objects
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Umbrella", "Parapluie"}, hint: localized{"Rain", "Pluie"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Telescope", "Télescope"}, hint: localized{"Lens", "Lentille"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Backpack", "Sac à dos"}, hint: localized{"Straps", "Bretelles"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Candle", "Bougie"}, hint: localized{"Wax", "Cire"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Compass", "Boussole"}, hint: localized{"North", "Nord"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Mirror", "Miroir"}, hint: localized{"Reflection", "Reflet"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Suitcase", "Valise"}, hint: localized{"Zipper", "Fermeture éclair"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Scissors", "Ciseaux"}, hint: localized{"Hairdresser", "Coiffeur"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Hammer", "Marteau"}, hint: localized{"Nail", "Clou"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Ladder", "Échelle"}, hint: localized{"Rungs", "Barreaux"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Pillow", "Oreiller"}, hint: localized{"Goose down", "Duvet"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Clock", "Horloge"}, hint: localized{"Hands", "Aiguilles"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Guitar", "Guitare"}, hint: localized{"Strings", "Cordes"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Piano", "Piano"}, hint: localized{"Keys", "Touches"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Key", "Clé"}, hint: localized{"Lock", "Serrure"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Wallet", "Portefeuille"}, hint: localized{"Banknotes", "Billets"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Glasses", "Lunettes"}, hint: localized{"Frames", "Montures"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Shoe", "Chaussure"}, hint: localized{"Laces", "Lacets"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Balloon", "Ballon"}, hint: localized{"Helium", "Hélium"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Television", "Télévision"}, hint: localized{"Remote", "Télécommande"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Microwave", "Micro-ondes"}, hint: localized{"Beep", "Bip"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Bathtub", "Baignoire"}, hint: localized{"Rubber duck", "Canard en plastique"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Toilet", "Toilettes"}, hint: localized{"Plunger", "Ventouse"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Anchor", "Ancre"}, hint: localized{"Ship", "Navire"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Sword", "Épée"}, hint: localized{"Scabbard", "Fourreau"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Crown", "Couronne"}, hint: localized{"Jewels", "Joyaux"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Helmet", "Casque"}, hint: localized{"Chin strap", "Mentonnière"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Broom", "Balai"}, hint: localized{"Witch", "Sorcière"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Trophy", "Trophée"}, hint: localized{"Podium", "Podium"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Drum", "Tambour"}, hint: localized{"Sticks", "Baguettes"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Dice", "Dés"}, hint: localized{"Board game", "Jeu de société"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Book", "Livre"}, hint: localized{"Spine", "Reliure"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Pencil", "Crayon"}, hint: localized{"Eraser", "Gomme"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Envelope", "Enveloppe"}, hint: localized{"Stamp", "Timbre"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Magnet", "Aimant"}, hint: localized{"Fridge", "Frigo"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Hourglass", "Sablier"}, hint: localized{"Sand", "Sable"}},
	{categoryKey: "objects", category: localized{"Objects", "Objets"}, word: localized{"Ring", "Bague"}, hint: localized{"Proposal", "Demande en mariage"}},

	// Activities
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Camping", "Camping"}, hint: localized{"Tent", "Tente"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Karaoke", "Karaoké"}, hint: localized{"Microphone", "Microphone"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Painting", "Peinture"}, hint: localized{"Canvas", "Toile"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Fishing", "Pêche"}, hint: localized{"Bait", "Appât"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Juggling", "Jonglerie"}, hint: localized{"Balls", "Balles"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Skiing", "Ski"}, hint: localized{"Slope", "Pente"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Swimming", "Natation"}, hint: localized{"Lane", "Couloir"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Cooking", "Cuisine"}, hint: localized{"Recipe", "Recette"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Dancing", "Danse"}, hint: localized{"Choreography", "Chorégraphie"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Bowling", "Bowling"}, hint: localized{"Pins", "Quilles"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Surfing", "Surf"}, hint: localized{"Wave", "Vague"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Knitting", "Tricot"}, hint: localized{"Yarn", "Laine"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Hiking", "Randonnée"}, hint: localized{"Trail", "Sentier"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Yoga", "Yoga"}, hint: localized{"Mat", "Tapis"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Chess", "Échecs"}, hint: localized{"Knight", "Cavalier"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Poker", "Poker"}, hint: localized{"Bluff", "Bluff"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Gardening", "Jardinage"}, hint: localized{"Weeds", "Mauvaises herbes"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Photography", "Photographie"}, hint: localized{"Tripod", "Trépied"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Skydiving", "Parachutisme"}, hint: localized{"Free fall", "Chute libre"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Diving", "Plongée"}, hint: localized{"Snorkel", "Tuba"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Golf", "Golf"}, hint: localized{"Caddie", "Caddie"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Tennis", "Tennis"}, hint: localized{"Racket", "Raquette"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Hockey", "Hockey"}, hint: localized{"Goalie", "Gardien de but"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Basketball", "Basketball"}, hint: localized{"Dunk", "Dunk"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Boxing", "Boxe"}, hint: localized{"Gloves", "Gants"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Sailing", "Voile"}, hint: localized{"Mast", "Mât"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Rowing", "Aviron"}, hint: localized{"Oar", "Rame"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Climbing", "Escalade"}, hint: localized{"Harness", "Harnais"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Sewing", "Couture"}, hint: localized{"Thimble", "Dé à coudre"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Karate", "Karaté"}, hint: localized{"Black belt", "Ceinture noire"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Meditation", "Méditation"}, hint: localized{"Lotus", "Lotus"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Gymnastics", "Gymnastique"}, hint: localized{"Balance beam", "Poutre"}},
	{categoryKey: "activities", category: localized{"Activities", "Activités"}, word: localized{"Skating", "Patinage"}, hint: localized{"Rink", "Patinoire"}},

	// Jobs
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Firefighter", "Pompier"}, hint: localized{"Pole", "Poteau"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Teacher", "Enseignant"}, hint: localized{"Chalkboard", "Tableau"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Pilot", "Pilote"}, hint: localized{"Cockpit", "Cabine"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Chef", "Chef cuisinier"}, hint: localized{"Apron", "Tablier"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Plumber", "Plombier"}, hint: localized{"Wrench", "Clé à molette"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Dentist", "Dentiste"}, hint: localized{"Cavity", "Carie"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Journalist", "Journaliste"}, hint: localized{"Scoop", "Scoop"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Photographer", "Photographe"}, hint: localized{"Flash", "Flash"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Astronaut", "Astronaute"}, hint: localized{"Spacesuit", "Scaphandre"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Judge", "Juge"}, hint: localized{"Gavel", "Marteau"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Architect", "Architecte"}, hint: localized{"Blueprint", "Plan"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Librarian", "Bibliothécaire"}, hint: localized{"Shush", "Chut"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Mime", "Mime"}, hint: localized{"Invisible wall", "Mur invisible"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Clown", "Clown"}, hint: localized{"Red nose", "Nez rouge"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Magician", "Magicien"}, hint: localized{"Top hat", "Haut-de-forme"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Pirate", "Pirate"}, hint: localized{"Treasure", "Trésor"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Detective", "Détective"}, hint: localized{"Magnifying glass", "Loupe"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Soldier", "Soldat"}, hint: localized{"Barracks", "Caserne"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Barber", "Barbier"}, hint: localized{"Razor", "Rasoir"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Surgeon", "Chirurgien"}, hint: localized{"Scalpel", "Scalpel"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Lifeguard", "Sauveteur"}, hint: localized{"Buoy", "Bouée"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Baker", "Boulanger"}, hint: localized{"Yeast", "Levure"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Carpenter", "Menuisier"}, hint: localized{"Sawdust", "Sciure"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Priest", "Prêtre"}, hint: localized{"Confession", "Confession"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Referee", "Arbitre"}, hint: localized{"Whistle", "Sifflet"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Scientist", "Scientifique"}, hint: localized{"Lab coat", "Blouse"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Psychologist", "Psychologue"}, hint: localized{"Couch", "Divan"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Cowboy", "Cowboy"}, hint: localized{"Lasso", "Lasso"}},
	{categoryKey: "jobs", category: localized{"Jobs", "Métiers"}, word: localized{"Spy", "Espion"}, hint: localized{"Disguise", "Déguisement"}},

	// Weather
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Thunderstorm", "Orage"}, hint: localized{"Lightning", "Éclair"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Rainbow", "Arc-en-ciel"}, hint: localized{"Prism", "Prisme"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Fog", "Brouillard"}, hint: localized{"Mist", "Brume"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Snowstorm", "Tempête de neige"}, hint: localized{"Blizzard", "Blizzard"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Hurricane", "Ouragan"}, hint: localized{"Eye", "Œil"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Tornado", "Tornade"}, hint: localized{"Funnel", "Entonnoir"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Hail", "Grêle"}, hint: localized{"Dented car", "Voiture cabossée"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Heatwave", "Canicule"}, hint: localized{"Air conditioner", "Climatiseur"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Drought", "Sécheresse"}, hint: localized{"Cracked earth", "Terre craquelée"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Frost", "Givre"}, hint: localized{"Scraper", "Grattoir"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Wind", "Vent"}, hint: localized{"Kite", "Cerf-volant"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Flood", "Inondation"}, hint: localized{"Sandbags", "Sacs de sable"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Snowflake", "Flocon"}, hint: localized{"Hexagon", "Hexagone"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Drizzle", "Bruine"}, hint: localized{"Droplets", "Gouttelettes"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Monsoon", "Mousson"}, hint: localized{"India", "Inde"}},
	{categoryKey: "weather", category: localized{"Weather", "Météo"}, word: localized{"Cloud", "Nuage"}, hint: localized{"Cotton", "Coton"}},
}

// pickWord returns a random word, restricted to categoryKey when it names a
// known category. An empty or unrecognized categoryKey draws from every word
// — see StartOptions.category's doc comment for why an unknown key is not an
// error.
//
// used is the English text of the words already dealt this match, and those are
// avoided. Once a pool has been played through, its words come round again rather
// than the round failing to deal.
func pickWord(categoryKey string, used []string) wordEntry {
	pool := wordList
	if categoryKey != "" {
		if filtered := wordsInCategory(categoryKey); len(filtered) > 0 {
			pool = filtered
		}
	}

	fresh := make([]wordEntry, 0, len(pool))
	for _, w := range pool {
		if !contains(used, w.word.en) {
			fresh = append(fresh, w)
		}
	}
	if len(fresh) > 0 {
		pool = fresh
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
