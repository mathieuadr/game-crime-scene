/* ═══════════════════════════════════════════════════════════════
   CRIME SCENE — engine.js
   Story management, case generation, RNG, consistency checks.
   This file has zero DOM dependencies — pure game logic.
   ═══════════════════════════════════════════════════════════════ */

// ─── Seeded RNG (mulberry32) ────────────────────────────────

function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

function createRng(seed) {
  return mulberry32(typeof seed === "number" ? seed : hashString(String(seed)));
}

function pick(arr, rng) { return arr[Math.floor(rng() * arr.length)]; }

function pickN(arr, n, rng) {
  const copy = arr.slice(), result = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = Math.floor(rng() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max, rng) { return Math.floor(rng() * (max - min + 1)) + min; }
function randFloat(min, max, rng) { return rng() * (max - min) + min; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ─── Data Pools ─────────────────────────────────────────────

const FIRST_NAMES = [
  "James","Elena","Victor","Clara","Marcus","Sofia","Daniel","Nora",
  "Arthur","Lena","Hugo","Isabel","Felix","Diana","Oscar","Maya",
  "Roman","Chloe","Leo","Vera","Camille","Alex","Simon","Margot"
];
const LAST_NAMES = [
  "Blackwood","Sinclair","Moreau","Ashford","Crane","Delacroix","Fontaine",
  "Graves","Hartwell","Kensington","Langley","Mercer","Northcott","Prescott",
  "Ravenswood","Sterling","Thornton","Whitmore","York","Zimmerman","Duval","Renard"
];

const ROLES = [
  "business partner","personal assistant","family lawyer","private nurse",
  "art dealer","sous-chef","estate manager","old friend","ex-lover",
  "financial advisor","gardener","family member","chauffeur","housekeeper"
];

const PERSONALITY_TRAITS = ["calm","nervous","arrogant","shy","aggressive","friendly"];

const SPEAKING_STYLES = {
  calm:       { tone: "measured",   verbosity: "medium", tics: [],                    politeness: 0.8, aggression: 0.1 },
  nervous:    { tone: "hesitant",   verbosity: "high",   tics: ["um","you know"],     politeness: 0.6, aggression: 0.2 },
  arrogant:   { tone: "dismissive", verbosity: "low",    tics: ["obviously","please"],politeness: 0.3, aggression: 0.5 },
  shy:        { tone: "quiet",      verbosity: "low",    tics: ["...","I think"],     politeness: 0.9, aggression: 0.05 },
  aggressive: { tone: "blunt",      verbosity: "medium", tics: ["look","listen"],     politeness: 0.2, aggression: 0.8 },
  friendly:   { tone: "warm",       verbosity: "high",   tics: ["honestly","hey"],    politeness: 0.85, aggression: 0.1 }
};

const RELATIONSHIP_TYPES = ["friend","rival","neutral","family","colleague","ex-lover"];

const LOCATIONS = [
  "the library","the garden","the kitchen","the study","the wine cellar",
  "the living room","the garage","the balcony","the hallway","the guest room",
  "the dining room","the terrace"
];

const ACTIVITIES = [
  "reading a book","making a phone call","having a drink","checking emails",
  "resting on the couch","looking out the window","organizing papers",
  "listening to music","smoking a cigarette","pacing nervously",
  "writing a letter","reviewing documents","having a snack","tidying up"
];

const VICTIM_POOL = [
  { name: "Lord Edmund Ashworth", age: 67, occupation: "Retired industrialist" },
  { name: "Catherine Bellamy",    age: 52, occupation: "Art gallery owner" },
  { name: "Professor Harold Finch", age: 61, occupation: "University professor" },
  { name: "Margaret Holloway",    age: 45, occupation: "Publishing magnate" },
  { name: "Dr. Simon Reeves",     age: 58, occupation: "Renowned surgeon" },
  { name: "Josephine Thatcher",   age: 70, occupation: "Wealthy heiress" }
];

const WEAPONS = [
  "a letter opener","a heavy candlestick","a poisoned glass of wine",
  "a silk scarf (strangulation)","a marble bookend","a fireplace poker"
];

const SECRET_POOL = [
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

const MOTIVE_REASONS = [
  "The victim threatened to expose a dark secret.",
  "The victim was about to change their will, cutting them out.",
  "A long-standing personal grudge that recently boiled over.",
  "The victim discovered their financial fraud.",
  "A romantic betrayal that led to obsessive resentment.",
  "The victim was blocking a deal worth a fortune.",
  "The victim humiliated them publicly and repeatedly.",
  "An inheritance that would only come with the victim's death."
];

const FABRIC_COLORS = ["dark blue","red","black","grey","green","burgundy","navy","cream"];
const PERSONAL_ITEMS = [
  "monogrammed handkerchief","silver lighter","pocket watch","signet ring",
  "leather glove","fountain pen","reading glasses","gold cufflink"
];

const TIME_LABELS = {
  T1: "8:00 PM",
  T2: "9:15 PM",
  T3: "10:30 PM"
};
const TIME_DESCRIPTIONS = {
  T1: "Before the murder",
  T2: "Murder window",
  T3: "After the murder"
};

// ─── Suspect Profile Generation ─────────────────────────────

function generate_suspects(count, rng) {
  const usedNames = new Set();
  const suspects = [];
  const roles = shuffle(ROLES, rng);

  for (let i = 0; i < count; i++) {
    let first, last, fullName;
    do {
      first = pick(FIRST_NAMES, rng);
      last = pick(LAST_NAMES, rng);
      fullName = `${first} ${last}`;
    } while (usedNames.has(fullName));
    usedNames.add(fullName);

    const trait = pick(PERSONALITY_TRAITS, rng);
    const speakStyle = { ...SPEAKING_STYLES[trait] };
    const secret = pick(SECRET_POOL, rng);

    suspects.push({
      id: `suspect_${String(i).padStart(2, "0")}`,
      index: i,
      name: fullName,
      firstName: first,
      age: randInt(25, 65, rng),
      role: roles[i % roles.length],

      personality: {
        trait,
        speaking_style: speakStyle,
        emotional_baseline: {
          stress: randFloat(0.2, 0.6, rng),
          confidence: randFloat(0.3, 0.8, rng),
          empathy: randFloat(0.3, 0.8, rng)
        }
      },

      relationships: {},

      motive: {
        level: "low",
        reason: "",
        intensity: randFloat(0.1, 0.4, rng)
      },

      truth_model: {
        base_truthfulness: randFloat(0.65, 0.9, rng),
        lie_when: {
          protect_self: rng() > 0.3,
          protect_other: rng() > 0.7,
          topic_is_secret: true,
          topic_is_motive: rng() > 0.4
        },
        lie_strategy: pick(["deflect", "deny", "minimize", "redirect"], rng),
        lie_rate_multiplier_if_culprit: randFloat(1.4, 2.0, rng)
      },

      schedule: {
        timeslots: ["T1", "T2", "T3"],
        locations: { T1: null, T2: null, T3: null },
        actual_locations: { T1: null, T2: null, T3: null },
        alibi: {
          claim: "",
          activities: { T1: "", T2: "", T3: "" },
          support: { witness_ids: [], evidence_ids: [] },
          weakness: { is_weak: false, why: "" }
        }
      },

      secrets: [{
        id: `secret_${i}_0`,
        type: secret.type,
        text: secret.text,
        revealed: false,
        reveal_triggers: {
          trust_threshold: randFloat(0.7, 0.9, rng),
          pressure_threshold: randFloat(0.7, 0.9, rng),
          if_presented_evidence_ids: []
        }
      }],

      knowledge: {
        known_facts: [],
        witnessed_events: [],
        unknowns: { culprit_id: null }
      },

      physical: {
        shoeSize: randInt(7, 12, rng),
        fabricColor: pick(FABRIC_COLORS, rng),
        personalItem: pick(PERSONAL_ITEMS, rng)
      },

      dialogue_policy: {
        system_rules: [
          "Never reveal the culprit_id directly.",
          "Keep answers consistent with schedule unless lying.",
          "When unsure, respond with uncertainty rather than inventing new facts.",
          "Stay in character at all times.",
          "Keep responses to 2-4 sentences. Be conversational."
        ],
        allowed_topics: ["alibi","relationships","victim","timeline","evidence","motive","secrets"],
        refusal_style: pick(["evasive", "defensive", "confused", "hostile"], rng),
        memory: {
          last_questions: [],
          revealed_secret_ids: [],
          revealed_fact_ids: []
        }
      },

      culprit_config: {
        is_culprit: false,
        contradictions_to_create: []
      }
    });
  }
  return suspects;
}

// ─── Relationships ──────────────────────────────────────────

function generate_relationships(suspects, rng) {
  for (let i = 0; i < suspects.length; i++) {
    for (let j = 0; j < suspects.length; j++) {
      if (i === j) continue;
      const otherId = suspects[j].id;
      if (suspects[i].relationships[otherId]) continue;

      const relType = pick(RELATIONSHIP_TYPES, rng);
      const affinity = randFloat(-0.5, 0.8, rng);
      const trust = randFloat(0.1, 0.8, rng);

      suspects[i].relationships[otherId] = { type: relType, affinity, trust };
      suspects[j].relationships[suspects[i].id] = { type: relType, affinity, trust: randFloat(0.1, 0.8, rng) };
    }
  }
}

// ─── Culprit Assignment ─────────────────────────────────────

function assign_culprit(caseData, suspects, rng) {
  const idx = Math.floor(rng() * suspects.length);
  const culprit = suspects[idx];

  culprit.culprit_config.is_culprit = true;
  culprit.motive = {
    level: "high",
    reason: pick(MOTIVE_REASONS, rng),
    intensity: randFloat(0.75, 0.95, rng)
  };
  culprit.truth_model.base_truthfulness = randFloat(0.15, 0.35, rng);

  const others = suspects.filter(s => s.id !== culprit.id);
  const mediumCount = Math.max(1, Math.floor(others.length / 2));
  shuffle(others, rng).slice(0, mediumCount).forEach(s => {
    s.motive = {
      level: "medium",
      reason: pick(MOTIVE_REASONS, rng),
      intensity: randFloat(0.4, 0.65, rng)
    };
  });

  caseData.culpritId = culprit.id;
  return culprit;
}

// ─── Timeline ───────────────────────────────────────────────

function generateTimeline(caseData, suspects, culprit, rng) {
  const locs = shuffle(LOCATIONS, rng).slice(0, Math.min(7, LOCATIONS.length));
  caseData.crime.location = locs[0];

  for (const s of suspects) {
    for (const t of ["T1", "T2", "T3"]) {
      if (s.id === culprit.id && t === "T2") {
        s.schedule.actual_locations[t] = caseData.crime.location;
      } else {
        s.schedule.actual_locations[t] = pick(locs.slice(1), rng);
      }
    }
  }

  for (const s of suspects) {
    if (s.id !== culprit.id && s.schedule.actual_locations.T2 === caseData.crime.location) {
      s.schedule.actual_locations.T2 = pick(locs.filter(l => l !== caseData.crime.location), rng);
    }
  }

  for (const s of suspects) {
    for (const t of ["T1", "T2", "T3"]) {
      const activity = pick(ACTIVITIES, rng);
      s.schedule.alibi.activities[t] = activity;

      if (s.id === culprit.id && t === "T2") {
        const falseLoc = pick(locs.filter(l => l !== caseData.crime.location), rng);
        s.schedule.locations[t] = falseLoc;
        s.schedule.alibi.claim = `At 9:15 PM I was in ${falseLoc}, ${activity}.`;
        s.schedule.alibi.weakness = {
          is_weak: true,
          why: "No one can corroborate this alibi and evidence contradicts it."
        };
      } else {
        const honest = rng() < s.truth_model.base_truthfulness;
        s.schedule.locations[t] = honest ? s.schedule.actual_locations[t] : pick(locs, rng);
      }
    }
  }
}

// ─── Evidence ───────────────────────────────────────────────

function generateEvidence(caseData, suspects, culprit, rng) {
  const evidence = [];
  const crimeLoc = caseData.crime.location;

  evidence.push({
    id: "evidence_footprint_01",
    type: "physical",
    description: `A muddy footprint matching size ${culprit.physical.shoeSize} shoes was found near ${crimeLoc}.`,
    pointsTo: culprit.id,
    strength: "strong"
  });

  evidence.push({
    id: "evidence_item_01",
    type: "physical",
    description: `A ${culprit.physical.personalItem} was found on the floor of ${crimeLoc}, near the victim.`,
    pointsTo: culprit.id,
    strength: "strong",
    linkedItem: culprit.physical.personalItem
  });

  const witnesses = suspects.filter(s => s.id !== culprit.id);
  const witness = pick(witnesses, rng);
  evidence.push({
    id: "evidence_witness_01",
    type: "testimony",
    description: `${witness.name} claims to have seen someone heading toward ${crimeLoc} around 9:15 PM.`,
    witnessId: witness.id,
    pointsTo: culprit.id,
    strength: "moderate"
  });

  const herring = pick(witnesses, rng);
  const herringLoc = pick(LOCATIONS.filter(l => l !== crimeLoc), rng);
  evidence.push({
    id: "evidence_herring_01",
    type: "physical",
    description: `A ${herring.physical.fabricColor} fiber was found on the ${herringLoc} door, matching ${herring.name}'s jacket.`,
    pointsTo: herring.id,
    strength: "weak",
    isRedHerring: true
  });

  evidence.push({
    id: "evidence_note_01",
    type: "document",
    description: `A threatening note reading "You'll pay for what you've done" was found in the victim's pocket. Handwriting is inconclusive.`,
    pointsTo: null,
    strength: "moderate"
  });

  caseData.evidence = evidence;

  for (const s of suspects) {
    s.knowledge.witnessed_events = [];

    if (s.id === witness.id) {
      s.knowledge.witnessed_events.push({
        event_id: "evt_witness_main",
        time: "T2",
        text: `I saw a figure moving toward ${crimeLoc} around 9:15 PM.`,
        certainty: 0.7,
        who_was_involved: ["unknown"]
      });
    }

    const others = suspects.filter(o => o.id !== s.id);
    const seenCount = randInt(0, 2, rng);
    for (let i = 0; i < seenCount; i++) {
      const seen = pick(others, rng);
      const t = pick(["T1", "T3"], rng);
      const accurate = rng() < 0.8;
      const loc = accurate ? seen.schedule.actual_locations[t] : pick(LOCATIONS, rng);
      s.knowledge.witnessed_events.push({
        event_id: `evt_${s.index}_saw_${seen.index}_${t}`,
        time: t,
        text: `Saw ${seen.name} in ${loc} around ${TIME_LABELS[t]}.`,
        certainty: randFloat(0.5, 0.9, rng),
        who_was_involved: [seen.id],
        location: loc,
        accurate
      });
      s.knowledge.known_facts.push({
        fact_id: `fact_${s.index}_${seen.index}_${t}`,
        text: `${seen.name} was in ${loc} at ${TIME_LABELS[t]}.`,
        aboutId: seen.id,
        time: t,
        location: loc,
        certainty: accurate ? 0.8 : 0.4
      });
    }
  }
}

// ─── Contradictions ─────────────────────────────────────────

function generateContradictions(caseData, suspects, culprit) {
  const contradictions = [];
  const crimeLoc = caseData.crime.location;

  contradictions.push({
    id: "contradiction_alibi_evidence",
    type: "alibi_vs_evidence",
    description: `${culprit.name} claims to have been in ${culprit.schedule.locations.T2} at 9:15 PM, but a size ${culprit.physical.shoeSize} footprint was found at ${crimeLoc}.`,
    involvedSuspect: culprit.id,
    severity: "critical"
  });

  contradictions.push({
    id: "contradiction_item",
    type: "object_vs_denial",
    description: `${culprit.name}'s ${culprit.physical.personalItem} was found at the crime scene, though they deny being there.`,
    involvedSuspect: culprit.id,
    severity: "critical"
  });

  const witnessEv = caseData.evidence.find(e => e.id === "evidence_witness_01");
  if (witnessEv) {
    const w = suspects.find(s => s.id === witnessEv.witnessId);
    contradictions.push({
      id: "contradiction_witness",
      type: "witness_vs_alibi",
      description: `${w.name} saw someone heading toward ${crimeLoc} at 9:15 PM, contradicting ${culprit.name}'s alibi.`,
      involvedSuspect: culprit.id,
      witnessId: w.id,
      severity: "strong"
    });
  }

  culprit.culprit_config.contradictions_to_create = contradictions.map(c => c.id);
  caseData.contradictions = contradictions;
}

// ─── Case Generation (main entry point) ─────────────────────

function generate_case(seed) {
  const rng = createRng(seed);

  const victim = pick(VICTIM_POOL, rng);
  const caseData = {
    seed,
    victim,
    crime: { time: "9:15 PM", location: null, weapon: pick(WEAPONS, rng) },
    culpritId: null,
    evidence: [],
    contradictions: [],
    solved: false,
    questionCount: 0
  };

  const suspectCount = window._suspectCount || 4;
  const suspects = generate_suspects(suspectCount, rng);
  generate_relationships(suspects, rng);
  const culprit = assign_culprit(caseData, suspects, rng);

  generateTimeline(caseData, suspects, culprit, rng);
  generateEvidence(caseData, suspects, culprit, rng);
  generateContradictions(caseData, suspects, culprit);

  const validity = check_consistency(caseData, suspects);
  if (!validity.valid) console.warn("Case consistency issues:", validity.issues);

  return { caseData, suspects, rng };
}

// ─── Consistency Check ──────────────────────────────────────

function check_consistency(caseData, suspects) {
  const issues = [];
  const culprits = suspects.filter(s => s.id === caseData.culpritId);
  if (culprits.length !== 1) issues.push("Must have exactly 1 culprit");

  const culprit = culprits[0];
  if (culprit && culprit.motive.level !== "high") issues.push("Culprit must have high motive");

  const cc = (caseData.contradictions || []).filter(c => c.involvedSuspect === caseData.culpritId);
  if (cc.length < 1) issues.push("Need >= 1 contradiction pointing to culprit");

  const ce = (caseData.evidence || []).filter(e => e.pointsTo === caseData.culpritId && !e.isRedHerring);
  if (ce.length < 2) issues.push("Need >= 2 independent clues pointing to culprit");

  if (culprit && culprit.schedule.actual_locations.T2 !== caseData.crime.location) {
    issues.push("Culprit must actually be at crime location at T2");
  }

  return { valid: issues.length === 0, issues, contradictionCount: cc.length, evidenceCount: ce.length };
}

// ─── Accusation Evaluation ──────────────────────────────────

function evaluate_accusation(caseData, accusedId) {
  const correct = accusedId === caseData.culpritId;
  return {
    correct,
    actualCulpritId: caseData.culpritId,
    message: correct
      ? "Brilliant deduction, Inspector! You've identified the murderer."
      : "That's not the right person. The real culprit remains free..."
  };
}
