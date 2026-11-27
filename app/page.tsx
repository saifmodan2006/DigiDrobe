import type { Metadata } from "next";
import Landing from "../components/Landing";
import { brand } from "../lib/config";

const title = "Digital Wardrobe & Outfit Planner";
const description =
  "Build a private digital wardrobe from photos of your clothes. Organize your closet, get outfit ideas from pieces you own, and save your favorite looks.";
const socialImage = {
  url: "/digidrobe-social.jpg",
  width: 1200,
  height: 630,
  alt: "Clothes and accessories arranged together as an outfit",
};

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: brand.name,
    title: `${title} · ${brand.name}`,
    description,
    images: [socialImage],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} · ${brand.name}`,
    description,
    images: [socialImage],
  },
};

const siteData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: brand.name,
  url: new URL("/", brand.siteUrl).href,
  description,
  inLanguage: "en",
};

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(siteData).replace(/</g, "\\u003c"),
        }}
      />
      <Landing />
    </>
  );
}
