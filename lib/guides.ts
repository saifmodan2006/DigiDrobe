import type { Metadata } from "next";
import { brand } from "./config";

export const wardrobeGuide = {
  path: "/digitize-your-wardrobe",
  title: "How to Digitize Your Wardrobe",
  description:
    "Turn clothing photos into a digital closet. Learn what to photograph first, how to capture clear images, and which details to record.",
};

export const outfitGuide = {
  path: "/plan-outfits-from-your-own-clothes",
  title: "How to Plan Outfits From Your Own Clothes",
  description:
    "Start with one garment, build a complete outfit from clothes you own, and compare alternatives before saving looks you want to wear.",
};

export function guideMetadata({ path, title, description }: typeof wardrobeGuide): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      siteName: brand.name,
      title: `${title} · ${brand.name}`,
      description,
    },
  };
}
