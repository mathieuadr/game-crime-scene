/* ═══════════════════════════════════════════════════════════════
   Data Pools — All content constants for case generation.
   Separated from logic so new content (images, sounds, themes)
   can be added without touching game mechanics.
   ═══════════════════════════════════════════════════════════════ */

export const FIRST_NAMES = [
  "James","Elena","Victor","Clara","Marcus","Sofia","Daniel","Nora",
  "Arthur","Lena","Hugo","Isabel","Felix","Diana","Oscar","Maya",
  "Roman","Chloe","Leo","Vera","Camille","Alex","Simon","Margot"
];

export const LAST_NAMES = [
  "Blackwood","Sinclair","Moreau","Ashford","Crane","Delacroix","Fontaine",
  "Graves","Hartwell","Kensington","Langley","Mercer","Northcott","Prescott",
  "Ravenswood","Sterling","Thornton","Whitmore","York","Zimmerman","Duval","Renard"
];

export const ROLES = [
  "business partner","personal assistant","family lawyer","private nurse",
  "art dealer","sous-chef","estate manager","old friend","ex-lover",
  "financial advisor","gardener","family member","chauffeur","housekeeper"
];

export const PERSONALITY_TRAITS = ["calm","nervous","arrogant","shy","aggressive","friendly"];

export const SPEAKING_STYLES = {
  calm:       { tone: "measured",   verbosity: "medium", tics: [],                    politeness: 0.8, aggression: 0.1 },
  nervous:    { tone: "hesitant",   verbosity: "high",   tics: ["um","you know"],     politeness: 0.6, aggression: 0.2 },
  arrogant:   { tone: "dismissive", verbosity: "low",    tics: ["obviously","please"],politeness: 0.3, aggression: 0.5 },
  shy:        { tone: "quiet",      verbosity: "low",    tics: ["...","I think"],     politeness: 0.9, aggression: 0.05 },
  aggressive: { tone: "blunt",      verbosity: "medium", tics: ["look","listen"],     politeness: 0.2, aggression: 0.8 },
  friendly:   { tone: "warm",       verbosity: "high",   tics: ["honestly","hey"],    politeness: 0.85, aggression: 0.1 }
};

export const RELATIONSHIP_TYPES = ["friend","rival","neutral","family","colleague","ex-lover"];

export const LOCATIONS = [
  "the library","the garden","the kitchen","the study","the wine cellar",
  "the living room","the garage","the balcony","the hallway","the guest room",
  "the dining room","the terrace"
];

export const ACTIVITIES = [
  "reading a book","making a phone call","having a drink","checking emails",
  "resting on the couch","looking out the window","organizing papers",
  "listening to music","smoking a cigarette","pacing nervously",
  "writing a letter","reviewing documents","having a snack","tidying up"
];

export const VICTIM_POOL = [
  { name: "Lord Edmund Ashworth", age: 67, occupation: "Retired industrialist" },
  { name: "Catherine Bellamy",    age: 52, occupation: "Art gallery owner" },
  { name: "Professor Harold Finch", age: 61, occupation: "University professor" },
  { name: "Margaret Holloway",    age: 45, occupation: "Publishing magnate" },
  { name: "Dr. Simon Reeves",     age: 58, occupation: "Renowned surgeon" },
  { name: "Josephine Thatcher",   age: 70, occupation: "Wealthy heiress" }
];

export const WEAPONS = [
  "a letter opener","a heavy candlestick","a poisoned glass of wine",
  "a silk scarf (strangulation)","a marble bookend","a fireplace poker"
];

export const SECRET_POOL = [
  { type: "financial", text: "is deeply in debt and desperate for money" },
  { type: "personal",  text: "was having a secret affair with the victim" },
  { type: "blackmail", text: "discovered the victim was blackmailing them" },
  { type: "financial", text: "recently forged the victim's will in their favor" },
  { type: "criminal",  text: "stole a valuable painting and the victim found out" },
  { type: "identity",  text: "has a criminal past under a different name" },
  { type: "escape",    text: "was planning to flee the country within days" },
  { type: "grudge",    text: "has secretly hated the victim for years" },
  { type: "witness",   text: "witnessed something incriminating the night before" },
  { type: "fraud",     text: "has been forging documents for the victim" }
];

export const MOTIVE_REASONS = [
  "The victim threatened to expose a dark secret.",
  "The victim was about to change their will, cutting them out.",
  "A long-standing personal grudge that recently boiled over.",
  "The victim discovered their financial fraud.",
  "A romantic betrayal that led to obsessive resentment.",
  "The victim was blocking a deal worth a fortune.",
  "The victim humiliated them publicly and repeatedly.",
  "An inheritance that would only come with the victim's death."
];

export const FABRIC_COLORS = ["dark blue","red","black","grey","green","burgundy","navy","cream"];

export const PERSONAL_ITEMS = [
  "monogrammed handkerchief","silver lighter","pocket watch","signet ring",
  "leather glove","fountain pen","reading glasses","gold cufflink"
];

export const TIME_LABELS = { T1: "8:00 PM", T2: "9:15 PM", T3: "10:30 PM" };
export const TIME_DESCRIPTIONS = { T1: "Before the murder", T2: "Murder window", T3: "After the murder" };

export const AVATAR_COLORS = ["#e94560","#0f3460","#4ade80","#fbbf24","#a78bfa","#f97316"];

export const VOICE_TONES = {
  calm:       "deep and measured, authoritative",
  nervous:    "high-pitched and hesitant, shaky",
  arrogant:   "sharp and commanding, dismissive",
  shy:        "soft and quiet, gentle",
  aggressive: "loud and rough, intimidating",
  friendly:   "warm and inviting, cheerful",
};
