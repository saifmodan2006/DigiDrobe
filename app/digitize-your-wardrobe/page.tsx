import Link from "next/link";
import GuideArticle from "../../components/GuideArticle";
import { guideMetadata, outfitGuide, wardrobeGuide } from "../../lib/guides";

export const metadata = guideMetadata(wardrobeGuide);

export default function DigitizeWardrobePage() {
  return (
    <GuideArticle {...wardrobeGuide}>
      <p>
        Start your digital wardrobe with the clothes you reach for in an
        ordinary week. Photograph each item separately so you can find it later
        and combine it with other pieces when you plan an outfit.
      </p>

      <h2>Pick pieces you can wear together</h2>
      <p>
        Try three tops, two bottoms, one layer, and two pairs of shoes. A white
        shirt, dark jeans, a jacket, and sneakers can become your first saved
        look. Photograph a second pair of shoes or another top so you can make
        a variation immediately. Add occasion pieces as you need them.
      </p>

      <h2>Photograph one garment at a time</h2>
      <p>
        Use indirect daylight and a plain background that contrasts with the
        garment. Lay knits flat so their shoulders keep their shape, hang jackets
        to show their cut, and leave room around sleeves and hems. Photograph
        patterned pieces straight on so the colors and pattern stay recognizable.
      </p>
      <p>
        In DigiDrobe, take a photo or upload a JPEG, PNG, or WebP from your
        camera roll. Crop and rotate the image, then review the background
        removal before saving. If a strap or part of the hem disappears, check
        the crop or retake the photo on a more contrasting background.
      </p>

      <h2>Record the details you search for</h2>
      <p>
        Give the item a name you would type later, such as “olive rain jacket.”
        Pick its category and main color, then add it to a collection if you
        often wear it for work, travel, or another occasion. Once you can build
        two useful looks from your first batch, add the next batch as you wear it.
      </p>

      <nav aria-label="Wardrobe next steps" className="policy-links">
        <Link href="/account/create">Create your digital wardrobe</Link>
        <Link href={outfitGuide.path}>Plan outfits from your own clothes</Link>
      </nav>
    </GuideArticle>
  );
}
