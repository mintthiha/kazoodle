// What the simulated Wavelength players like, shared by the typed and spoken runs.

/** Each Clue Giver's own taste in a category, from least favourite (1) to favourite
 * (10). Two different ladders, so the two answers to one number differ the way two
 * real people's would. */
export const TASTES: Record<string, [string[], string[]]> = {
  Animals: [
    ["Mosquito", "Cockroach", "Rat", "Pigeon", "Goat", "Horse", "Penguin", "Dolphin", "Red panda", "Otter"],
    ["Tick", "Wasp", "Snake", "Seagull", "Cow", "Sheep", "Owl", "Fox", "Elephant", "Dog"],
  ],
  Food: [
    ["Liver", "Olives", "Brussels sprouts", "Tofu", "Rice", "Pasta", "Burritos", "Ramen", "Sushi", "Pizza"],
    ["Blue cheese", "Anchovies", "Beets", "Cabbage", "Salad", "Soup", "Curry", "Tacos", "Steak", "Poutine"],
  ],
  "Movies you've seen": [
    ["Cats (2019)", "Morbius", "Twilight", "Transformers", "Frozen", "Jaws", "Shrek", "Inception", "Up", "The Lion King"],
    ["The Room", "Batman & Robin", "Fifty Shades", "Avatar", "Titanic", "Toy Story", "Spirited Away", "Interstellar", "Parasite", "The Matrix"],
  ],
  Drinks: [
    ["Prune juice", "Fernet", "Tomato juice", "Tonic water", "Water", "Iced tea", "Lemonade", "Cold brew", "Bubble tea", "Hot chocolate"],
    ["Jägermeister", "Kombucha", "Milk", "Diet cola", "Orange juice", "Ginger ale", "Beer", "Matcha latte", "Margarita", "Espresso"],
  ],
  "Holiday spots": [
    ["Airport hotel", "Parking lot", "Gas station", "Theme park", "Cottage", "Paris", "Barcelona", "Lisbon", "Bali", "Kyoto"],
    ["Mall", "Motel", "Las Vegas", "Cruise ship", "Toronto", "New York", "London", "Rome", "Iceland", "Hawaii"],
  ],
  Sports: [
    ["Golf", "Cricket", "Curling", "Baseball", "Tennis", "Cycling", "Volleyball", "Basketball", "Hockey", "Soccer"],
    ["Darts", "Bowling", "Fishing", "Running", "Swimming", "Badminton", "Skiing", "Climbing", "Surfing", "Snowboarding"],
  ],
  Snacks: [
    ["Rice cakes", "Celery", "Raisins", "Pretzels", "Popcorn", "Trail mix", "Nachos", "Gummy bears", "Cookies", "Chips"],
    ["Licorice", "Prunes", "Granola bar", "Crackers", "Apple", "Cheese sticks", "Doritos", "M&Ms", "Brownies", "Ice cream"],
  ],
  Cars: [
    ["Minivan", "Smart car", "Hummer", "Pickup truck", "Civic", "Corolla", "Jeep", "Mustang", "Tesla", "Porsche 911"],
    ["Monster truck", "Hearse", "School bus", "Station wagon", "Mini", "Beetle", "Volvo", "BMW", "Ferrari", "Lamborghini"],
  ],
  Songs: [
    ["Baby Shark", "Macarena", "Gangnam Style", "Despacito", "Hey Jude", "Wonderwall", "Africa", "Bohemian Rhapsody", "Mr. Brightside", "Dancing Queen"],
    ["Crazy Frog", "Friday", "Cotton Eye Joe", "Call Me Maybe", "Let It Go", "Yellow", "Hallelujah", "Uptown Funk", "September", "Billie Jean"],
  ],
};
