import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "Learn how DigiDrobe handles Google sign-in, wardrobe photos and account data.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="policy-page">
      <Link href="/">DigiDrobe home</Link>
      <h1>Privacy policy</h1>
      <p>DigiDrobe lets you build a private digital wardrobe from photos of your clothes.</p>

      <h2>Google sign-in</h2>
      <p>
        If you choose Continue with Google, Google shares your email address,
        Google account identifier and basic profile information, such as your
        name and profile picture, with Supabase Auth. Supabase stores this
        information in your authentication record. DigiDrobe uses the resulting
        account and session to sign you in and keep your wardrobe tied to your
        account. DigiDrobe requests only basic identity permissions.
      </p>

      <h2>Wardrobe data</h2>
      <p>
        Supabase stores your account, garment photos, item details, collections and
        outfits. Vercel hosts the website. When the hosted background removal service
        is enabled, Photoroom receives a processed garment image to remove its
        background. Google sign-in does not send wardrobe photos or outfit data to Google.
      </p>

      <h2>Deleting data</h2>
      <p>
        To permanently delete a garment, move it to Trash and delete it there.
        For account deletion or questions about your data, contact{" "}
        <a href="mailto:saifmodan000@gmail.com">saifmodan000@gmail.com</a>.
        You can also remove DigiDrobe’s Google connection from your Google Account settings.
      </p>

      <nav aria-label="Site policies" className="policy-links">
        <Link href="/terms">Terms of use</Link>
      </nav>
    </main>
  );
}
