import { useEffect, useState } from "react";
import { db, checked, message } from "../lib/client";
export default function Settings({
  userId,
  email,
}: {
  userId: string;
  email: string;
}) {
  const [theme, select] = useState("system"),
    [colors, palette] = useState(""),
    [style, setStyle] = useState(""),
    [note, tell] = useState(""),
    [ready, setReady] = useState(false);
  useEffect(() => {
    db!
      .from("preferences")
      .select("*")
      .eq("owner_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          tell(error.message);
          return;
        }
        select(data?.theme || "system");
        palette((data?.preferred_colors || []).join(", "));
        setStyle(data?.style || "");
        setReady(true);
      });
  }, [userId]);
  return (
    <>
      <h1>Account</h1>
      <p className="intro">{email}</p>
      <form
        className="panel"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            checked(
              await db!.from("preferences").upsert({
                owner_id: userId,
                theme,
                preferred_colors: colors
                  .split(",")
                  .map((v) => v.trim())
                  .filter(Boolean),
                style,
              }),
            );
            document.documentElement.dataset.theme = theme;
            tell("Preferences saved.");
          } catch (e) {
            tell(message(e));
          }
        }}
      >
        <h2>Preferences</h2>
        <label>
          Appearance
          <select value={theme} onChange={(e) => select(e.target.value)}>
            {["system", "light", "dark"].map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Preferred colors, separated by commas
          <input value={colors} onChange={(e) => palette(e.target.value)} />
        </label>
        <label>
          Personal style
          <input
            value={style}
            maxLength={120}
            onChange={(e) => setStyle(e.target.value)}
          />
        </label>
        <button disabled={!ready} className="primary">
          Save preferences
        </button>
      </form>
      <p role="status">{note}</p>
      <button
        onClick={async () => {
          const { error } = await db!.auth.signOut();
          if (error) tell(error.message);
          else {
            sessionStorage.removeItem("wardrobe-filters-" + userId);
            location.replace("/account");
          }
        }}
      >
        Sign out
      </button>
    </>
  );
}
