import type { MetadataRoute } from "next";
import { brand } from "../lib/config";
import { outfitGuide, wardrobeGuide } from "../lib/guides";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", wardrobeGuide.path, outfitGuide.path, "/privacy", "/terms"].map((path) => ({
    url: new URL(path, brand.siteUrl).href,
  }));
}
