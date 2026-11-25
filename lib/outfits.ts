export const slots = [
  "Top",
  "Bottom",
  "One-piece",
  "Footwear",
  "Outerwear",
  "Glasses",
  "Watch",
  "Accessory",
  "Accessory 2",
] as const;
export type Slot = (typeof slots)[number];
export type Picked = { slot: Slot; item_id: string | null; locked: boolean };
export type Picks = Picked[];
export interface Garment {
  id: string;
  owner_id: string;
  name: string;
  category: string | null;
  subtype?: string | null;
  color?: string | null;
  pattern?: string | null;
  tags?: string[] | null;
  occasion?: string | null;
  availability: string;
  status: string;
  favorite?: boolean;
  deleted_at?: string | null;
}
export interface Options {
  owner: string;
  locked?: Picks;
  excluded?: string[];
  occasion?: string;
  colors?: string[];
  style?: string;
  layers?: boolean;
  favorites?: boolean;
  feedback?: Record<string, number>;
  round?: number;
  previouslyShown?: string[];
}
const categoryFor: Record<Slot, string> = {
  Top: "Tops",
  Bottom: "Bottoms",
  "One-piece": "One-piece",
  Footwear: "Footwear",
  Outerwear: "Outerwear",
  Glasses: "Accessories",
  Watch: "Accessories",
  Accessory: "Accessories",
  "Accessory 2": "Accessories",
};
const lower = (value?: string | null) => (value || "").trim().toLowerCase();
export function fits(item: Garment, slot: Slot) {
  if (item.category !== categoryFor[slot]) return false;
  if (item.category !== "Accessories") return true;
  const subtype = lower(item.subtype);
  if (["glasses", "sunglasses", "eyeglasses"].includes(subtype))
    return slot === "Glasses";
  if (["watch", "watches"].includes(subtype)) return slot === "Watch";
  return slot === "Accessory" || slot === "Accessory 2";
}
export function eligible(item: Garment, owner: string) {
  return (
    item.owner_id === owner &&
    item.status === "ready" &&
    lower(item.availability) === "available" &&
    !item.deleted_at
  );
}
export function conflict(a: Slot, b: Slot) {
  return (
    (a === "One-piece" && (b === "Top" || b === "Bottom")) ||
    (b === "One-piece" && (a === "Top" || a === "Bottom"))
  );
}
export function place(
  picks: Picks,
  slot: Slot,
  item: Garment,
  owner: string,
): Picks {
  if (!eligible(item, owner) || !fits(item, slot))
    throw Error("Choose an available garment that fits this slot.");
  if (
    picks.some(
      (p) =>
        p.locked &&
        (conflict(p.slot, slot) ||
          (p.slot === slot && p.item_id !== item.id) ||
          (p.item_id === item.id && p.slot !== slot)),
    )
  )
    throw Error("Unlock the affected slot before replacing its garment.");
  return [
    ...picks.filter(
      (p) =>
        p.slot !== slot && !conflict(p.slot, slot) && p.item_id !== item.id,
    ),
    {
      slot,
      item_id: item.id,
      locked: picks.some((p) => p.slot === slot && p.locked),
    },
  ];
}
export function signature(picks: Picks) {
  return picks
    .flatMap((p) => (p.item_id ? [p.item_id] : []))
    .sort()
    .join(",");
}
export function missing(picks: Picks) {
  const present = new Set(picks.filter((p) => p.item_id).map((p) => p.slot));
  return (["Top", "Bottom", "Footwear"] as Slot[]).filter(
    (s) => !present.has(s) && !(present.has("One-piece") && s !== "Footwear"),
  );
}
function hash(text: string) {
  let result = 2166136261;
  for (const character of text)
    result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  result = Math.imul(result ^ (result >>> 16), 0x85ebca6b);
  return (result ^ (result >>> 13)) >>> 0;
}
export function recommend(items: Garment[], options: Options): Picks[] {
  const excluded = new Set(options.excluded);
  const pool = items.filter(
    (item) => eligible(item, options.owner) && !excluded.has(item.id),
  );
  const byId = new Map(pool.map((item) => [item.id, item]));
  const fixed = (options.locked || []).filter((p) => p.locked);
  for (const entry of fixed) {
    const item = entry.item_id && byId.get(entry.item_id);
    if (
      !item ||
      !fits(item, entry.slot) ||
      fixed.some(
        (p) =>
          p !== entry &&
          (p.item_id === entry.item_id ||
            p.slot === entry.slot ||
            conflict(p.slot, entry.slot)),
      )
    )
      throw Error(
        `Resolve the locked ${entry.slot.toLowerCase()} slot. Unlock or replace it, or remove its exclusion.`,
      );
  }
  const occasion = lower(options.occasion);
  const colors = (options.colors || []).map(lower);
  const scores = new Map<string, number>();
  function score(item: Garment) {
    const cached = scores.get(item.id);
    if (cached !== undefined) return cached;
    const tags = [item.occasion, ...(item.tags || [])].map(lower);
    const result =
      (occasion && tags.includes(occasion) ? 4 : 0) +
      (colors.includes(lower(item.color)) && item.color ? 2 : 0) +
      (lower(options.style) && tags.includes(lower(options.style)) ? 2 : 0) +
      (options.favorites !== false && item.favorite ? 1 : 0) +
      hash(item.id + "/" + (options.round || 0)) / 4294967296;
    scores.set(item.id, result);
    return result;
  }
  type Candidate = { picks: Picks; score: number };
  const choices: Candidate[] = [];
  for (const base of [["Top", "Bottom"], ["One-piece"]] as Slot[][]) {
    if (fixed.some((p) => base.some((slot) => conflict(p.slot, slot))))
      continue;
    if (base[0] === "One-piece" && !pool.some((i) => fits(i, "One-piece")))
      continue;
    let beam: Candidate[] = [{ picks: fixed, score: 0 }];
    for (const slot of [
      ...base,
      "Footwear",
      "Outerwear",
      "Glasses",
      "Watch",
      "Accessory",
      "Accessory 2",
    ] as Slot[]) {
      if (
        fixed.some((p) => p.slot === slot) ||
        (slot === "Outerwear" && !options.layers) ||
        slot === "Accessory 2"
      )
        continue;
      const shortlist = pool
        .filter((i) => fits(i, slot))
        .sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))
        .slice(0, 6);
      const next: Candidate[] = [];
      for (const candidate of beam) {
        const allowed = shortlist.filter(
          (item) => !candidate.picks.some((p) => p.item_id === item.id),
        );
        if (!allowed.length) {
          next.push(candidate);
          continue;
        }
        for (const item of allowed) {
          const patterned = (i: Garment) =>
            Boolean(
              i.pattern &&
              !["solid", "plain", "unknown"].includes(lower(i.pattern)),
            );
          const mixed =
            patterned(item) &&
            candidate.picks.some(
              (p) => p.item_id && patterned(byId.get(p.item_id)!),
            );
          next.push({
            picks: [
              ...candidate.picks,
              { slot, item_id: item.id, locked: false },
            ],
            score:
              candidate.score +
              score(item) +
              (base.includes(slot) ? 3 : 0) -
              (mixed ? 2 : 0),
          });
        }
      }
      beam = next.sort((a, b) => b.score - a.score).slice(0, 48);
    }
    choices.push(...beam.filter((c) => c.picks.length));
  }
  const unique = new Map<string, Candidate>();
  for (const candidate of choices) {
    const key = signature(candidate.picks);
    const feedback = options.feedback?.[key] || 0;
    if (feedback < 0) continue;
    const score =
      candidate.score +
      feedback * 3 +
      (missing(candidate.picks).length === 0 ? 4 : 0);
    if (!unique.has(key) || unique.get(key)!.score < score)
      unique.set(key, { ...candidate, score });
  }
  // Use the fullest valid structure available to this wardrobe. A dress and shoes
  // should never produce a second, shoes-only suggestion just to fill the carousel.
  const openSlots = Math.min(
    ...Array.from(unique.values(), (c) => missing(c.picks).length),
  );
  for (const [key, candidate] of unique)
    if (missing(candidate.picks).length > openSlots) unique.delete(key);
  const previouslyShown = new Set(options.previouslyShown);
  if (Array.from(unique.keys()).some((key) => !previouslyShown.has(key))) {
    for (const key of previouslyShown) unique.delete(key);
  }
  const selected: Picks[] = [];
  function overlap(a: Picks, b: Picks) {
    return a.reduce(
      (n, p) =>
        n +
        (b.some((q) => q.item_id === p.item_id)
          ? ["Top", "Bottom", "One-piece"].includes(p.slot)
            ? 3
            : 1
          : 0),
      0,
    );
  }
  while (selected.length < 3 && unique.size) {
    const ranked = [...unique.values()].sort((a, b) => {
      const rank = (c: Candidate) =>
        c.score -
        Math.max(0, ...selected.map((other) => overlap(c.picks, other))) * 2.5;
      return (
        rank(b) - rank(a) ||
        signature(a.picks).localeCompare(signature(b.picks))
      );
    });
    selected.push(ranked[0].picks);
    unique.delete(signature(ranked[0].picks));
  }
  return selected;
}
