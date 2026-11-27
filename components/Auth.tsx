"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { brand } from "../lib/config";
import { db, message } from "../lib/client";
import Logo from "./Logo";
const minimumPasswordLength = 6;
const confirmationNotice =
  "If this is a new account, check your inbox for a confirmation link.";
const googleSignInEnabled = process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN === "true";
const googleSignInError = "Google sign-in didn’t finish. Please try again.";
export default function Auth({
  recovery = false,
  initialMode = "login",
  onReset,
}: {
  recovery?: boolean;
  initialMode?: "login" | "signup";
  onReset: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(initialMode),
    [visible, show] = useState(false),
    [notice, tell] = useState(""),
    [error, setError] = useState(""),
    [busy, working] = useState(false);
  const emailField = useRef<HTMLInputElement>(null);
  const focusAfterSwitch = useRef(false);
  useEffect(() => {
    const url = new URL(location.href);
    if (url.searchParams.get("provider") !== "google") return;
    const fragment = new URLSearchParams(url.hash.slice(1));
    if (!url.searchParams.has("error") && !fragment.has("error")) return;
    setError(googleSignInError);
    history.replaceState(null, "", url.pathname);
  }, []);
  const heading = recovery
    ? "Choose a new password"
    : mode === "login"
      ? "Welcome back."
      : mode === "signup"
        ? "Create your wardrobe."
        : "Reset your password.";
  useEffect(() => {
    const screen = recovery
      ? "Choose a new password"
      : mode === "login"
        ? "Sign in"
        : mode === "signup"
          ? "Create account"
          : "Reset password";
    document.title = screen + " · " + brand.name;
  }, [mode, recovery]);
  useEffect(() => {
    if (focusAfterSwitch.current) {
      emailField.current?.focus();
      focusAfterSwitch.current = false;
    }
  }, [mode]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || busy) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") || "").trim(),
      password = String(data.get("password") || "");
    working(true);
    tell("");
    setError("");
    try {
      if (!recovery && mode === "signup") {
        const result = await db.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: location.origin + "/account" },
        });
        if (result.error) throw result.error;
        if (!result.data.session) {
          tell(confirmationNotice);
        }
        return;
      }
      const result = recovery
        ? await db.auth.updateUser({ password })
        : mode === "login"
          ? await db.auth.signInWithPassword({ email, password })
          : await db.auth.resetPasswordForEmail(email, {
              redirectTo: location.origin + "/account?recovery=1",
            });
      if (result.error) throw result.error;
      if (recovery) {
        onReset();
      } else if (mode === "forgot") {
        tell("Check your email for a link to continue.");
      }
    } catch (e) {
      const code = e instanceof Error && "code" in e ? e.code : undefined;
      if (
        !recovery &&
        mode === "signup" &&
        (code === "user_already_exists" || code === "email_exists")
      ) {
        tell(confirmationNotice);
      } else if (!recovery && mode === "login" && code === "email_not_confirmed") {
        setError(
          "Confirm your email before signing in. If the link has expired, choose Create an account below to request a fresh one.",
        );
      } else if (!recovery && mode === "login" && code === "invalid_credentials") {
        setError(
          `The email or password is incorrect. If you’re new to ${brand.name}, choose Create an account below.`,
        );
      } else {
        setError(message(e));
      }
    } finally {
      working(false);
    }
  }
  async function continueWithGoogle() {
    if (!db || busy) return;
    working(true);
    tell("");
    setError("");
    try {
      const { error } = await db.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: location.origin + "/account?provider=google" },
      });
      if (error) throw error;
    } catch {
      setError(googleSignInError);
    } finally {
      working(false);
    }
  }
  function change(next: typeof mode) {
    if (busy) return;
    focusAfterSwitch.current = true;
    setMode(next);
    tell("");
    setError("");
    show(false);
  }
  return (
    <main className="auth">
      <header>
        <Link className="auth-home" href="/" aria-label={brand.name + " home"}>
          <Logo />
        </Link>
        <span>
          <LockKeyhole size={15} /> Private wardrobe
        </span>
      </header>
      <div className="auth-grid">
        <figure className="editorial">
          <img
            src="/editorial.webp"
            alt="A softly lit selection of garments on a clothing rail"
          />
          <figcaption>
            <span>{brand.tagline}</span>
          </figcaption>
        </figure>
        <section className="signin">
          <div className="auth-inner">
            <h1>{heading}</h1>
            <p>
              {recovery
                ? "Use at least six characters."
                : mode === "login"
                  ? "Sign in to your personal wardrobe."
                  : mode === "signup"
                    ? "Create a private account with a password of at least six characters."
                    : "We’ll email you a recovery link."}
            </p>
            <form onSubmit={submit} style={{ marginTop: "1.5rem" }}>
              {!recovery && (
                <label>
                  Email address
                  <input
                    ref={emailField}
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    required
                  />
                </label>
              )}
              {(recovery || mode !== "forgot") && (
                <label>
                  Password
                  <span className="password">
                    <input
                      key={recovery ? "recovery" : mode}
                      name="password"
                      type={visible ? "text" : "password"}
                      autoComplete={
                        mode === "login" && !recovery
                          ? "current-password"
                          : "new-password"
                      }
                      minLength={
                        mode === "login" && !recovery
                          ? 1
                          : minimumPasswordLength
                      }
                      required
                    />
                    <button
                      type="button"
                      aria-label={visible ? "Hide password" : "Show password"}
                      onClick={() => show(!visible)}
                    >
                      {visible ? <EyeOff /> : <Eye />}
                    </button>
                  </span>
                </label>
              )}
              {mode === "login" && !recovery && (
                <button
                  type="button"
                  className="text-button forgot"
                  disabled={busy}
                  onClick={() => change("forgot")}
                >
                  Forgot password?
                </button>
              )}
              <button
                type="submit"
                disabled={busy || !db}
                className="primary full"
              >
                {busy
                  ? "Please wait…"
                  : recovery
                    ? "Update password"
                    : mode === "login"
                      ? "Sign in"
                      : mode === "signup"
                        ? "Create account"
                        : "Send recovery link"}
              </button>
            </form>
            {googleSignInEnabled && db && !recovery && mode !== "forgot" && (
              <button
                type="button"
                className="full auth-google"
                disabled={busy}
                onClick={continueWithGoogle}
              >
                <Image
                  src="/google-g.png"
                  alt=""
                  width={200}
                  height={204}
                  unoptimized
                />
                Continue with Google
              </button>
            )}
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
            <p role="status">{notice}</p>
            {!recovery && (
              <p>
                {mode === "login"
                  ? "New to " + brand.name + "? "
                  : mode === "signup"
                    ? "Already have an account? "
                    : ""}
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => change(mode === "login" ? "signup" : "login")}
                >
                  {mode === "login"
                    ? "Create an account"
                    : mode === "signup" && notice
                      ? "Sign in"
                      : "Back to sign in"}
                </button>
              </p>
            )}
            {!db && (
              <aside className="notice">
                <strong>Account setup required</strong>
                <p>
                  Connect Supabase using the two public settings in
                  .env.example, then restart the app to enable sign-in.
                </p>
              </aside>
            )}
            <nav aria-label="Site policies" className="policy-links">
              <Link href="/privacy">Privacy policy</Link>
              <Link href="/terms">Terms of use</Link>
            </nav>
          </div>
        </section>
      </div>
    </main>
  );
}
