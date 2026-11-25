"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Shirt,
  Layers,
  FolderOpen,
  UserRound,
  Plus,
  Heart,
  ClipboardCheck,
  Trash2,
} from "lucide-react";
import Auth from "./Auth";
import Logo from "./Logo";
import Wardrobe from "./Wardrobe";
import Capture from "./Capture";
import Detail from "./Detail";
import Groups from "./Groups";
import Settings from "./Settings";
import Outfits from "./Outfits";
import type { Item } from "../lib/model";
import { db, checked, message } from "../lib/client";
import { brand } from "../lib/config";
const pages = [
  ["Wardrobe", Shirt],
  ["Outfits", Layers],
  ["Collections", FolderOpen],
  ["Account", UserRound],
] as const;
const views = [
  ["Favorites", Heart],
  ["Needs review", ClipboardCheck],
  ["Trash", Trash2],
] as const;
export default function Studio() {
  const [session, set] = useState<Session | null>(null),
    [loading, load] = useState(!!db),
    [recovery, reset] = useState(false);
  useEffect(() => {
    if (!db) return;
    reset(new URLSearchParams(location.search).has("recovery"));
    const { data } = db.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") reset(true);
      set(s);
      load(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (loading)
    return (
      <main role="status" className="loading">
        <Logo />
        Opening your wardrobe…
      </main>
    );
  if (!session || recovery)
    return (
      <Auth
        recovery={!!session && recovery}
        onReset={() => {
          reset(false);
          history.replaceState(null, "", location.pathname);
        }}
      />
    );
  return <Workspace key={session.user.id} session={session} />;
}
function Workspace({ session }: { session: Session }) {
  const [route, place] = useState("Wardrobe"),
    [items, setItems] = useState<Item[]>([]),
    [notice, tell] = useState(""),
    [waiting, wait] = useState(true),
    [failure, fail] = useState(""),
    [start, style] = useState<string>();
  const [page, param] = route.split("/");
  const generation = useRef(0),
    cache = useRef(new Map<string, { url: string; expires: number }>());
  useEffect(() => {
    function follow() {
      let path = "Wardrobe";
      try {
        path = decodeURIComponent(location.hash.slice(1)) || path;
      } catch {}
      place(path);
      tell("");
      window.scrollTo(0, 0);
    }
    follow();
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  function go(path: string) {
    location.hash = encodeURIComponent(path);
  }
  useEffect(() => {
    document.title = page + " · " + brand.name;
  }, [page]);
  useEffect(() => {
    let active = true;
    db!
      .from("preferences")
      .select("theme")
      .eq("owner_id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active)
          document.documentElement.dataset.theme =
            data?.theme?.toLowerCase() || "system";
      });
    return () => {
      active = false;
      delete document.documentElement.dataset.theme;
    };
  }, [session.user.id]);
  const refresh = useCallback(async () => {
    const n = ++generation.current;
    try {
      const data: Item[] = [];
      const batchSize = 250;
      for (let start = 0; ; start += batchSize) {
        const batch = checked(
          await db!
            .from("items")
            .select("*")
            .eq("owner_id", session.user.id)
            .order("created_at", { ascending: false })
            .order("id")
            .range(start, start + batchSize - 1),
        ) as Item[];
        data.push(...batch);
        if (batch.length < batchSize) break;
      }
      const paths = [
        ...new Set(
          data
            .flatMap((i) =>
              i.deleted_at
                ? []
                : [i.thumbnail_path, i.cutout_path, i.original_path],
            )
            .filter((p): p is string => !!p),
        ),
      ];
      const missing = paths.filter(
        (p) => (cache.current.get(p)?.expires || 0) < Date.now(),
      );
      for (let i = 0; i < missing.length; i += 100) {
        const signed = checked(
          await db!.storage
            .from("wardrobe")
            .createSignedUrls(missing.slice(i, i + 100), 1800),
        );
        for (const s of signed || []) {
          if (s.path && s.signedUrl)
            cache.current.set(s.path, {
              url: s.signedUrl,
              expires: Date.now() + 1500000,
            });
        }
      }
      if (generation.current === n) {
        setItems(
          data.map((i) => ({
            ...i,
            original: cache.current.get(i.original_path || "")?.url,
            thumbnail: cache.current.get(i.thumbnail_path || "")?.url,
            cutout: cache.current.get(i.cutout_path || "")?.url,
          })),
        );
        fail("");
      }
    } catch (e) {
      if (generation.current === n) fail(message(e));
    } finally {
      if (generation.current === n) wait(false);
    }
  }, [session.user.id]);
  useEffect(() => {
    void refresh();
    let t = setInterval(
      () => {
        if (!document.hidden) void refresh();
      },
      items.some((i) => ["queued", "running"].includes(i.status))
        ? 3000
        : 60000,
    );
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", refresh);
      generation.current++;
    };
  }, [refresh, items.some((i) => ["queued", "running"].includes(i.status))]);
  const item = items.find((i) => i.id === param),
    wardrobe = [
      "Wardrobe",
      "Favorites",
      "Needs review",
      "Trash",
      "Collection",
    ].includes(page);
  const styleItem = (id: string) => {
    style(id);
    go("Outfits");
  };
  const nav = (title: string, Icon: typeof Shirt) => (
    <button
      key={title}
      aria-current={title === page ? "page" : undefined}
      onClick={() => {
        style(undefined);
        go(title);
      }}
    >
      <Icon size={19} />
      {title}
    </button>
  );
  return (
    <div className="shell">
      <a
        href="#main"
        className="skip"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="sidebar">
        <Logo />
        <nav aria-label="Main navigation">
          {pages.map(([title, Icon]) => nav(title, Icon))}
        </nav>
        <nav className="secondary-nav" aria-label="Wardrobe views">
          {views.map(([title, Icon]) => nav(title, Icon))}
        </nav>
        <small>{brand.tagline}</small>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <Logo />
          <span>{brand.descriptor}</span>
          <button
            className="account"
            aria-label="Account settings"
            onClick={() => go("Account")}
          >
            <UserRound size={19} />
          </button>
        </header>
        <main tabIndex={-1} id="main">
          {wardrobe && (
            <>
              <div className="page-heading">
                <h1>
                  {page === "Wardrobe"
                    ? "My wardrobe"
                    : page === "Collection"
                      ? "Collection"
                      : page}
                </h1>
                <button className="primary" onClick={() => go("Add item")}>
                  <Plus size={18} />
                  Add item
                </button>
              </div>
              <div className="mobile-views">
                {["Wardrobe", "Favorites", "Needs review", "Trash"].map((v) => (
                  <button
                    key={v}
                    aria-pressed={v === page}
                    onClick={() => go(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </>
          )}
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          {failure && (
            <div role="alert" className="notice">
              {failure} <button onClick={refresh}>Retry loading</button>
            </div>
          )}
          {waiting ? (
            <p role="status">Loading your wardrobe…</p>
          ) : wardrobe ? (
            <Wardrobe
              userId={session.user.id}
              {...{ items, page, param, go, refresh, tell }}
            />
          ) : page === "Add item" ? (
            <Capture
              key={param || "new"}
              item={item}
              go={go}
              refresh={refresh}
            />
          ) : page === "Item" ? (
            item ? (
              <Detail
                key={item.id}
                item={item}
                {...{ go, refresh, tell, styleItem }}
              />
            ) : (
              <p>
                This item is unavailable.{" "}
                <button onClick={() => go("Wardrobe")}>Open wardrobe</button>
              </p>
            )
          ) : page === "Collections" ? (
            <Groups userId={session.user.id} go={go} />
          ) : page === "Account" ? (
            <Settings
              userId={session.user.id}
              email={session.user.email || ""}
            />
          ) : page === "Outfits" ? (
            <Outfits
              items={items}
              userId={session.user.id}
              startId={start}
              db={db!}
            />
          ) : (
            <button onClick={() => go("Wardrobe")}>Return to wardrobe</button>
          )}
        </main>
      </div>
    </div>
  );
}
