"use client";
import { useEffect, useState, type FormEvent } from "react";
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
    [busy, working] = useState(false);
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
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db) return;
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email") || ""),
      password = String(data.get("password") || "");
    working(true);
    tell("");
    try {
      const result = recovery
        ? await db.auth.updateUser({ password })
        : mode === "login"
          ? await db.auth.signInWithPassword({ email, password })
          : mode === "signup"
            ? await db.auth.signUp({
                email,
                password,
                options: { emailRedirectTo: location.origin },
              })
            : await db.auth.resetPasswordForEmail(email, {
                redirectTo: location.origin + "/?recovery=1",
              });
      if (result.error) throw result.error;
      if (recovery) {
        onReset();
      } else if (mode === "forgot" || mode === "signup") {
        tell("Check your email for a link to continue.");
      }
    } catch (e) {
      tell(message(e));
    } finally {
      working(false);
    }
  }
  function change(next: typeof mode) {
    setMode(next);
    tell("");
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
            {!recovery && mode !== "forgot" && (
              <div className="switcher">
                {(["login", "signup"] as const).map((m, i) => (
                  <button
                    key={m}
                    aria-pressed={mode === m}
                    onClick={() => change(m)}
                  >
                    {["Sign in", "Create account"][i]}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={submit}>
              {!recovery && (
                <label>
                  Email address
                  <input
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
                  onClick={() => change("forgot")}
                >
                  Forgot password?
                </button>
              )}
              <button disabled={busy || !db} className="primary full">
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
            {mode === "forgot" && (
              <button className="text-button" onClick={() => change("login")}>
                Back to sign in
              </button>
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
