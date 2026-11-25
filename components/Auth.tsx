"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { brand } from "../lib/config";
import { db, message } from "../lib/client";
import Logo from "./Logo";
export default function Auth({
  recovery = false,
  onReset,
}: {
  recovery?: boolean;
  onReset: () => void;
}) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login"),
    [visible, show] = useState(false),
    [notice, tell] = useState(""),
    [error, setError] = useState(""),
    [busy, working] = useState(false);
  const emailField = useRef<HTMLInputElement>(null);
  const focusAfterSwitch = useRef(false);
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
          options: { emailRedirectTo: location.origin },
        });
        if (result.error) throw result.error;
        if (!result.data.session) {
          tell(
            "Check your inbox and follow the confirmation link to activate your account.",
          );
        }
        return;
      }
      const result = recovery
        ? await db.auth.updateUser({ password })
        : mode === "login"
          ? await db.auth.signInWithPassword({ email, password })
          : await db.auth.resetPasswordForEmail(email, {
              redirectTo: location.origin + "/?recovery=1",
            });
      if (result.error) throw result.error;
      if (recovery) {
        onReset();
      } else if (mode === "forgot") {
        tell("Check your email for a link to continue.");
      }
    } catch (e) {
      if (
        mode === "login" &&
        !recovery &&
        e instanceof Error &&
        "code" in e &&
        e.code === "invalid_credentials"
      ) {
        setError(
          "The email or password is incorrect. If you’re new to DrapeDeck, choose Create an account below.",
        );
      } else {
        setError(message(e));
      }
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
        <Logo />
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
                ? "Use at least eight characters."
                : mode === "login"
                  ? "Sign in to your personal wardrobe."
                  : mode === "signup"
                    ? "Keep your pieces and plan looks in one private space."
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
                      minLength={mode === "login" && !recovery ? 1 : 8}
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
            {error && (
              <p className="notice" role="alert">
                {error}
              </p>
            )}
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
                  {mode === "login" ? "Create an account" : "Back to sign in"}
                </button>
              </p>
            )}
            <p role="status">{notice}</p>
            {!db && (
              <aside className="notice">
                <strong>Account setup required</strong>
                <p>
                  Connect Supabase using the two public settings in
                  .env.example, then restart the app to enable sign-in.
                </p>
              </aside>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
