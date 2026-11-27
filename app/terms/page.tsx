import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "Read the terms for using DigiDrobe to organize clothing photos and plan outfits.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <main className="policy-page">
      <Link href="/">DigiDrobe home</Link>
      <h1>Terms of use</h1>
      <p>DigiDrobe is a tool for organizing clothing photos and arranging outfits for visual comparison.</p>

      <h2>Using your wardrobe</h2>
      <p>
        Upload photos you own or have permission to use. Use your own account
        and respect other users’ accounts and data. Keep access to your sign-in
        method secure.
      </p>

      <h2>Contact</h2>
      <p>
        Send questions about DigiDrobe to{" "}
        <a href="mailto:saifmodan000@gmail.com">saifmodan000@gmail.com</a>.
      </p>

      <nav aria-label="Site policies" className="policy-links">
        <Link href="/privacy">Privacy policy</Link>
      </nav>
    </main>
  );
}
