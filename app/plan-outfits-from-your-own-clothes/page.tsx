import Link from "next/link";
import GuideArticle from "../../components/GuideArticle";
import { guideMetadata, outfitGuide, wardrobeGuide } from "../../lib/guides";

export const metadata = guideMetadata(outfitGuide);

export default function PlanOutfitsPage() {
  return (
    <GuideArticle {...outfitGuide}>
      <p>
        Choose where you are going and pick one piece you want to wear. An outfit
        planner helps you see what goes with it using clothes you already own.
        Start with a complete look, then change one part at a time.
      </p>

      <h2>Build around one piece</h2>
      <p>
        If you want to wear a navy blazer, start with a white shirt, straight-leg
        jeans, and loafers. For a warmer day, try a light tee with the same jeans.
        For a dress or jumpsuit, start with shoes and a layer. Pick the option
        that suits how much you will walk and how formal the occasion is.
      </p>

      <h2>Swap one item and compare the looks</h2>
      <p>
        In DigiDrobe’s outfit builder, lock the piece you want to keep and try
        suggestions from the garments you have added. Keep the blazer in both
        looks and swap loafers for sneakers, then compare the outfits side by
        side. Try a second change only if you still need to adjust the look.
      </p>

      <h2>Save the version you will actually wear</h2>
      <p>
        Give the look a clear name like “Office day with loafers” and add an
        occasion or note that helps you remember why it works. If a key piece is
        in the laundry, choose a substitute before saving the outfit you plan to
        wear. Save a second version when the same pieces work for another setting.
      </p>
      <p>
        The outfit board helps you compare colors, shapes, and combinations.
        Try the pieces on together when you need to check fit, the way they layer,
        or how comfortable they are for the day ahead.
      </p>

      <nav aria-label="Outfit planning next steps" className="policy-links">
        <Link href="/account/create">Start planning outfits</Link>
        <Link href={wardrobeGuide.path}>Digitize your wardrobe first</Link>
      </nav>
    </GuideArticle>
  );
}
