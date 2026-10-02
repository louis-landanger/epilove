import type { Database } from "../client";
import { interest } from "../schema";

type Category =
  | "sport"
  | "music"
  | "gaming"
  | "tech"
  | "science"
  | "arts"
  | "outings"
  | "lifestyle"
  | "causes"
  | "travel";

/** Closed interest catalogue (PRO-04): no free tags, hence no offensive tags. */
export const INTERESTS: ReadonlyArray<{ slug: string; category: Category; fr: string; en: string }> = [
  // Sport
  { slug: "climbing", category: "sport", fr: "Escalade", en: "Climbing" },
  { slug: "running", category: "sport", fr: "Course à pied", en: "Running" },
  { slug: "football", category: "sport", fr: "Football", en: "Football" },
  { slug: "basketball", category: "sport", fr: "Basket", en: "Basketball" },
  { slug: "volleyball", category: "sport", fr: "Volley", en: "Volleyball" },
  { slug: "rugby", category: "sport", fr: "Rugby", en: "Rugby" },
  { slug: "swimming", category: "sport", fr: "Natation", en: "Swimming" },
  { slug: "gym", category: "sport", fr: "Muscu", en: "Gym" },
  { slug: "yoga", category: "sport", fr: "Yoga", en: "Yoga" },
  { slug: "cycling", category: "sport", fr: "Vélo", en: "Cycling" },
  { slug: "skiing", category: "sport", fr: "Ski et snow", en: "Skiing and snowboarding" },
  { slug: "hiking", category: "sport", fr: "Randonnée", en: "Hiking" },
  { slug: "parkour", category: "sport", fr: "Parkour", en: "Parkour" },
  { slug: "martial-arts", category: "sport", fr: "Arts martiaux", en: "Martial arts" },
  { slug: "dance", category: "sport", fr: "Danse", en: "Dance" },
  { slug: "tennis", category: "sport", fr: "Tennis et padel", en: "Tennis and padel" },
  // Music
  { slug: "rap", category: "music", fr: "Rap", en: "Rap" },
  { slug: "electro", category: "music", fr: "Électro", en: "Electronic" },
  { slug: "rock", category: "music", fr: "Rock", en: "Rock" },
  { slug: "pop", category: "music", fr: "Pop", en: "Pop" },
  { slug: "jazz", category: "music", fr: "Jazz", en: "Jazz" },
  { slug: "classical", category: "music", fr: "Classique", en: "Classical" },
  { slug: "kpop", category: "music", fr: "K-pop", en: "K-pop" },
  { slug: "play-instrument", category: "music", fr: "Jouer d'un instrument", en: "Playing an instrument" },
  { slug: "singing", category: "music", fr: "Chant", en: "Singing" },
  { slug: "festivals", category: "music", fr: "Festivals", en: "Festivals" },
  // Gaming
  { slug: "video-games", category: "gaming", fr: "Jeux vidéo", en: "Video games" },
  { slug: "esport", category: "gaming", fr: "E-sport", en: "Esports" },
  { slug: "board-games", category: "gaming", fr: "Jeux de société", en: "Board games" },
  { slug: "tabletop-rpg", category: "gaming", fr: "Jeux de rôle", en: "Tabletop RPGs" },
  { slug: "retro-gaming", category: "gaming", fr: "Rétrogaming", en: "Retro gaming" },
  { slug: "speedrun", category: "gaming", fr: "Speedrun", en: "Speedrunning" },
  // Tech
  { slug: "open-source", category: "tech", fr: "Open source", en: "Open source" },
  { slug: "cybersecurity", category: "tech", fr: "Cybersécurité", en: "Cybersecurity" },
  { slug: "ctf", category: "tech", fr: "CTF", en: "CTFs" },
  { slug: "ai", category: "tech", fr: "Intelligence artificielle", en: "Artificial intelligence" },
  { slug: "robotics", category: "tech", fr: "Robotique", en: "Robotics" },
  { slug: "electronics", category: "tech", fr: "Électronique", en: "Electronics" },
  { slug: "game-dev", category: "tech", fr: "Création de jeux", en: "Game development" },
  { slug: "hackathons", category: "tech", fr: "Hackathons", en: "Hackathons" },
  { slug: "mechanical-keyboards", category: "tech", fr: "Claviers mécaniques", en: "Mechanical keyboards" },
  // Science
  { slug: "space", category: "science", fr: "Espace et astronomie", en: "Space and astronomy" },
  { slug: "aviation", category: "science", fr: "Aviation", en: "Aviation" },
  { slug: "biology", category: "science", fr: "Biologie", en: "Biology" },
  { slug: "chemistry", category: "science", fr: "Chimie", en: "Chemistry" },
  { slug: "neuroscience", category: "science", fr: "Neurosciences", en: "Neuroscience" },
  { slug: "maths", category: "science", fr: "Maths", en: "Maths" },
  { slug: "ecology", category: "science", fr: "Écologie", en: "Ecology" },
  // Arts
  { slug: "photography", category: "arts", fr: "Photo", en: "Photography" },
  { slug: "drawing", category: "arts", fr: "Dessin", en: "Drawing" },
  { slug: "design", category: "arts", fr: "Design", en: "Design" },
  { slug: "cinema", category: "arts", fr: "Cinéma", en: "Cinema" },
  { slug: "series", category: "arts", fr: "Séries", en: "TV series" },
  { slug: "anime", category: "arts", fr: "Animés et mangas", en: "Anime and manga" },
  { slug: "comics", category: "arts", fr: "BD et comics", en: "Comics" },
  { slug: "reading", category: "arts", fr: "Lecture", en: "Reading" },
  { slug: "theatre", category: "arts", fr: "Théâtre et impro", en: "Theatre and improv" },
  { slug: "writing", category: "arts", fr: "Écriture", en: "Writing" },
  { slug: "museums", category: "arts", fr: "Musées et expos", en: "Museums and exhibitions" },
  // Outings
  { slug: "bars", category: "outings", fr: "Bars et terrasses", en: "Bars and terraces" },
  { slug: "clubbing", category: "outings", fr: "Soirées", en: "Clubbing" },
  { slug: "concerts", category: "outings", fr: "Concerts", en: "Concerts" },
  { slug: "brunch", category: "outings", fr: "Brunchs", en: "Brunch" },
  { slug: "escape-games", category: "outings", fr: "Escape games", en: "Escape rooms" },
  { slug: "karaoke", category: "outings", fr: "Karaoké", en: "Karaoke" },
  // Lifestyle
  { slug: "cooking", category: "lifestyle", fr: "Cuisine", en: "Cooking" },
  { slug: "baking", category: "lifestyle", fr: "Pâtisserie", en: "Baking" },
  { slug: "coffee", category: "lifestyle", fr: "Café de spécialité", en: "Specialty coffee" },
  { slug: "tea", category: "lifestyle", fr: "Thé", en: "Tea" },
  { slug: "vegetarian", category: "lifestyle", fr: "Cuisine végétarienne", en: "Vegetarian food" },
  { slug: "fashion", category: "lifestyle", fr: "Mode", en: "Fashion" },
  { slug: "thrifting", category: "lifestyle", fr: "Friperie", en: "Thrifting" },
  { slug: "plants", category: "lifestyle", fr: "Plantes", en: "Plants" },
  { slug: "pets", category: "lifestyle", fr: "Animaux", en: "Pets" },
  { slug: "astrology", category: "lifestyle", fr: "Astrologie (sans juger)", en: "Astrology (no judgement)" },
  // Causes
  { slug: "volunteering", category: "causes", fr: "Bénévolat", en: "Volunteering" },
  { slug: "climate", category: "causes", fr: "Climat", en: "Climate" },
  { slug: "student-associations", category: "causes", fr: "Vie associative", en: "Student associations" },
  // Travel
  { slug: "backpacking", category: "travel", fr: "Voyages sac à dos", en: "Backpacking" },
  { slug: "languages", category: "travel", fr: "Langues étrangères", en: "Foreign languages" },
  { slug: "road-trips", category: "travel", fr: "Road trips", en: "Road trips" },
  { slug: "erasmus", category: "travel", fr: "Échanges et Erasmus", en: "Exchanges and Erasmus" },
];

export async function seedInterests(db: Database) {
  for (const entry of INTERESTS) {
    await db
      .insert(interest)
      .values({ slug: entry.slug, category: entry.category, labelFr: entry.fr, labelEn: entry.en })
      .onConflictDoUpdate({
        target: interest.slug,
        set: { category: entry.category, labelFr: entry.fr, labelEn: entry.en },
      });
  }
}
