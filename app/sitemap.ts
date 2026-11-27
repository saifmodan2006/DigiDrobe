import type { MetadataRoute } from "next";
import { brand } from "../lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/privacy", "/terms"].map((path) => ({
    url: new URL(path, brand.siteUrl).href,
  }));
}
