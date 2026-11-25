import brand from "./brand.json";
export { brand };
export const title = `${brand.name} — ${brand.descriptor}`;
export const categories: Record<string, string[]> = {
  Tops: ["Shirts", "T-shirts", "Polos", "Blouses", "Sweaters"],
  Bottoms: ["Trousers", "Jeans", "Shorts", "Skirts", "Leggings"],
  Outerwear: ["Jackets", "Blazers", "Coats"],
  "One-piece": ["Dresses", "Jumpsuits"],
  Footwear: ["Sneakers", "Formal shoes", "Boots", "Sandals"],
  Accessories: [
    "Glasses",
    "Watches",
    "Belts",
    "Bags",
    "Hats",
    "Scarves",
    "Jewelry",
  ],
};
export const availability = ["Available", "In laundry", "Packed", "Archived"];
