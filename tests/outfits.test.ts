import assert from "node:assert/strict";
import test from "node:test";
import {
  eligible,
  fits,
  missing,
  place,
  recommend,
  signature,
} from "../lib/outfits";
import type { Garment, Picks } from "../lib/outfits";
const owner = "account-a";
const item = (
  id: string,
  category: string,
  fields: Partial<Garment> = {},
): Garment => ({
  id,
  category,
  name: id,
  owner_id: owner,
  status: "ready",
  availability: "Available",
  ...fields,
});
const wardrobe = [
  item("linen", "Tops", { tags: ["office"], color: "olive", favorite: true }),
  item("tee", "Tops", { pattern: "stripes" }),
  item("slacks", "Bottoms"),
  item("boots", "Footwear"),
  item("dress", "One-piece"),
  item("frames", "Accessories", { subtype: "Glasses" }),
  item("time", "Accessories", { subtype: "Watches" }),
];
test("suggestions are real, deterministic, eligible, structurally valid and distinct", () => {
  const inventory = [
    ...wardrobe,
    item("wrong-owner", "Tops", { owner_id: "b" }),
    item("trash", "Bottoms", { deleted_at: "today" }),
    item("laundry", "Tops", { availability: "In laundry" }),
    item("draft", "Tops", { status: "needs_review" }),
  ];
  const options = {
    owner,
    occasion: "Office",
    colors: ["Olive"],
    excluded: ["tee"],
  };
  const looks = recommend(inventory, options);
  assert.deepEqual(recommend(inventory, options), looks);
  assert.ok(looks.length >= 2 && looks.length <= 3);
  assert.equal(new Set(looks.map(signature)).size, looks.length);
  for (const look of looks) {
    assert.equal(new Set(look.map((p) => p.item_id)).size, look.length);
    assert.equal(
      look.some((p) => p.slot === "Top") &&
        look.some((p) => p.slot === "One-piece"),
      false,
    );
    for (const p of look) {
      const i = wardrobe.find((i) => i.id === p.item_id)!;
      assert.ok(i && eligible(i, owner) && fits(i, p.slot) && i.id !== "tee");
    }
  }
});
test("valid locks survive regeneration and invalid locks surface actionable conflicts", () => {
  const lock: Picks = [{ slot: "Top", item_id: "tee", locked: true }];
  for (const look of recommend(wardrobe, { owner, locked: lock, round: 4 }))
    assert.deepEqual(
      look.find((p) => p.slot === "Top"),
      lock[0],
    );
  for (const options of [
    { excluded: ["tee"] },
    {
      locked: [
        ...lock,
        { slot: "One-piece" as const, item_id: "dress", locked: true },
      ],
    },
    { locked: [{ slot: "Watch" as const, item_id: "frames", locked: true }] },
  ]) {
    assert.throws(
      () => recommend(wardrobe, { owner, locked: lock, ...options }),
      /locked/i,
    );
  }
  assert.throws(
    () =>
      recommend(
        wardrobe.filter((i) => i.id !== "tee"),
        { owner, locked: lock },
      ),
    /Unlock/,
  );
});
test("partial, empty, user feedback and color preference behavior", () => {
  assert.deepEqual(recommend([], { owner }), []);
  const pants = item("pants", "Bottoms");
  const only = recommend([pants], { owner });
  assert.equal(only.length, 1);
  assert.deepEqual(missing(only[0]), ["Top", "Footwear"]);
  assert.deepEqual(
    recommend([pants], { owner, feedback: { [signature(only[0])]: -1 } }),
    [],
  );
  const options = [
    item("sage", "Tops", { color: "sage" }),
    item("red", "Tops", { color: "red" }),
  ];
  assert.equal(
    recommend(options, { owner, colors: ["sage"] })[0][0].item_id,
    "sage",
  );
});
test("replacing a slot preserves other pieces; one-piece cannot replace a locked base", () => {
  const picks: Picks = [
    { slot: "Top", item_id: "tee", locked: false },
    { slot: "Bottom", item_id: "slacks", locked: true },
  ];
  const changed = place(picks, "Top", wardrobe[0], owner);
  assert.deepEqual(
    changed.find((p) => p.slot === "Bottom"),
    picks[1],
  );
  assert.throws(() => place(picks, "One-piece", wardrobe[4], owner), /Unlock/);
  assert.deepEqual(
    place(
      picks.map((p) => ({ ...p, locked: false })),
      "One-piece",
      wardrobe[4],
      owner,
    ),
    [{ slot: "One-piece", item_id: "dress", locked: false }],
  );
  assert.throws(() => place(picks, "Glasses", wardrobe[6], owner), /fits/);
});
test("large inventories use bounded shortlists before combining", () => {
  const inventory = Array.from({ length: 4000 }, (_, i) =>
    item(String(i), ["Tops", "Bottoms", "Footwear", "Outerwear"][i % 4]),
  );
  const looks = recommend(inventory, { owner, layers: true });
  assert.equal(looks.length, 3);
  assert.ok(looks.every((l) => l.length === 4));
});
test("alternatives prefer unseen combinations and avoid needlessly incomplete looks", () => {
  const inventory = ["blue", "red", "yellow", "green"].map((name) =>
    item(name, "Tops"),
  );
  const initial = recommend(inventory, { owner });
  const previouslyShown = initial.map(signature);
  const alternatives = recommend(inventory, {
    owner,
    previouslyShown,
    round: 1,
  });
  assert.equal(alternatives.length, 1);
  assert.ok(!previouslyShown.includes(signature(alternatives[0])));
  const dress = wardrobe.filter((i) => ["dress", "boots"].includes(i.id));
  assert.equal(recommend(dress, { owner }).length, 1);
  assert.deepEqual(missing(recommend(dress, { owner })[0]), []);
});
