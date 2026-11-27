import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, LockKeyhole } from "lucide-react";
import { brand } from "../lib/config";
import Logo from "./Logo";
import LegacyAuthCallback from "./LegacyAuthCallback";
import "./landing.css";

const steps = [
  {
    title: "Photograph a piece",
    description:
      "Upload a photo or use your camera. Crop it, remove the background, and review the cutout.",
  },
  {
    title: "Organize your wardrobe",
    description:
      "Sort pieces by category, save favorites, and build collections for work, weekends, or travel.",
  },
  {
    title: "Put looks together",
    description:
      "Build an outfit from your own clothes, compare combinations, and save the ones you want to wear.",
  },
];

export default function Landing() {
  const [taglineLead, ...taglineRest] = brand.tagline.split(/(?<=\.) /);
  return (
    <div className="landing" id="top">
      <LegacyAuthCallback />
      <a className="skip" href="#content">
        Skip to content
      </a>
      <header className="landing-header">
        <div className="landing-nav landing-wrap">
          <Link href="/" aria-label={brand.name + " home"}>
            <Logo />
          </Link>
          <nav aria-label={`Explore ${brand.name}`}>
            <a href="#wardrobe">The wardrobe</a>
            <a href="#how-it-works">How it works</a>
          </nav>
          <div className="landing-actions">
            <Link className="landing-signin" href="/account">
              Sign in
            </Link>
            <Link className="landing-button" href="/account/create">
              Create account
            </Link>
          </div>
        </div>
      </header>
      <main id="content">
        <section
          className="landing-hero landing-wrap"
          aria-labelledby="landing-title"
        >
          <div className="landing-intro">
            <p className="landing-kicker">{brand.descriptor}</p>
            <h1 id="landing-title">
              {taglineLead}
              {taglineRest.length > 0 && (
                <>
                  <br />
                  <span className="landing-title-highlight">
                    <em>{taglineRest.join(" ")}</em>
                    <Image
                      src="/fabric-d-mark.webp"
                      alt=""
                      width={76}
                      height={76}
                      unoptimized
                    />
                  </span>
                </>
              )}
            </h1>
            <p className="landing-lede">
              See everything you own, put outfits together, and save the looks
              you’ll actually wear.
            </p>
            <div className="landing-actions">
              <Link className="landing-button" href="/account/create">
                Create your wardrobe{" "}
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
              <a className="landing-explore" href="#how-it-works">
                How it works <ArrowDown size={16} aria-hidden="true" />
              </a>
            </div>
          </div>
          <figure className="landing-hero-image">
            <Image
              src="/editorial.webp"
              alt="A cream shirt, an olive jacket and tailored trousers hanging from a brass rail"
              fill
              priority
              sizes="(max-width: 760px) 92vw, 48vw"
            />
          </figure>
        </section>

        <section
          className="landing-workflow"
          id="how-it-works"
          aria-labelledby="workflow-title"
        >
          <div className="landing-wrap">
            <p className="landing-kicker">How it works</p>
            <h2 id="workflow-title">From camera roll to outfit.</h2>
            <ol className="landing-steps">
              {steps.map(({ title, description }) => (
                <li key={title}>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          className="landing-look landing-wrap"
          id="wardrobe"
          aria-labelledby="wardrobe-title"
        >
          <figure>
            <Image
              src="/wardrobe-flatlay.webp"
              alt="Olive outerwear, cream knitwear, dark trousers and accessories arranged as a look"
              fill
              sizes="(max-width: 760px) 92vw, 44vw"
            />
          </figure>
          <div>
            <p className="landing-kicker">The wardrobe</p>
            <h2 id="wardrobe-title">Wear what you already own in more ways.</h2>
            <p className="landing-lede">
              Start with a favorite piece, hold it in place, and swap the rest.
              Get suggestions from the clothes you’ve added and compare looks
              side by side.
            </p>
            <p className="landing-private">
              <LockKeyhole size={18} aria-hidden="true" /> Your photos and
              outfits stay private to your account.
            </p>
            <Link className="landing-button" href="/account/create">
              Start your wardrobe <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-wrap">
          <Link href="/" aria-label={brand.name + " home"}>
            <Logo />
          </Link>
          <span>{brand.tagline}</span>
          <nav aria-label="Site policies" className="policy-links">
            <Link href="/privacy">Privacy policy</Link>
            <Link href="/terms">Terms of use</Link>
          </nav>
          <a href="#top">Back to top ↑</a>
        </div>
      </footer>
    </div>
  );
}
