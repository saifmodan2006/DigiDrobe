"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { brand } from "../lib/config";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Columns2,
  Heart,
  Layers,
  LockKeyhole,
  LockKeyholeOpen,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import {
  conflict,
  eligible,
  fits,
  missing,
  place,
  recommend,
  signature,
  slots,
} from "../lib/outfits";
import type { Picks, Slot } from "../lib/outfits";
import type { Item } from "../lib/model";
import "./outfits.css";

type Look = {
  id: string;
  version: number;
  name: string;
  occasion: string;
  notes: string;
  favorite: boolean;
  status: "draft" | "saved";
  outfit_items: Picks;
};
type Props = {
  items: Item[];
  userId: string;
  startId?: string;
  db: SupabaseClient;
};
type Style = {
  colors: string;
  personalStyle: string;
  layers: boolean;
  favorites: boolean;
};
const defaultStyle: Style = {
  colors: "",
  personalStyle: "",
  layers: false,
  favorites: true,
};
const newLook = (): Look => ({
  id: crypto.randomUUID(),
  version: 0,
  name: "Untitled look",
  occasion: "",
  notes: "",
  favorite: false,
  status: "draft",
  outfit_items: [],
});
const lookFields =
  "id,version,name,occasion,notes,favorite,status,outfit_items(slot,item_id,locked)";
function errorText(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "Could not save changes. Please try again.";
}
function garmentFor(items: Item[], id: string | null | undefined) {
  return items.find((i) => i.id === id);
}
function imageFor(item?: Item) {
  return item?.cutout || item?.thumbnail;
}
function Modal({
  name,
  close,
  children,
  opener,
}: {
  opener: HTMLElement | null;
  name: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    const trigger =
      opener ||
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    d?.showModal();
    return () => {
      d?.close();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
      else
        document
          .querySelector<HTMLButtonElement>(".looks-tabs button")
          ?.focus();
    };
  }, [opener]);
  return (
    <dialog
      className="look-dialog"
      ref={ref}
      aria-label={name}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header>
        <h3>{name}</h3>
        <button aria-label="Close" type="button" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function MiniBoard({ picks, items }: { picks: Picks; items: Item[] }) {
  const ordered = slots
    .map((s) => picks.find((p) => p.slot === s))
    .filter((p) => p != null);
  return (
    <div className="mini-board">
      {ordered.length ? (
        ordered.slice(0, 4).map((p) => {
          const item = garmentFor(items, p.item_id);
          const url = imageFor(item);
          return url &&
            item &&
            eligible(item, item.owner_id) &&
            fits(item, p.slot) ? (
            <img key={p.slot} src={url} alt={item!.name} loading="lazy" />
          ) : (
            <span key={p.slot}>{p.slot} unavailable</span>
          );
        })
      ) : (
        <Layers size={30} aria-label="Empty board" />
      )}
    </div>
  );
}
function LookSummary({ look, items }: { look: Look; items: Item[] }) {
  const absent = missing(look.outfit_items);
  const occasion = look.occasion.toLowerCase().trim();
  const matches = look.outfit_items
    .map((p) => garmentFor(items, p.item_id))
    .filter(
      (i) =>
        i &&
        occasion &&
        [i.occasion, ...(i.tags || [])].some(
          (t) => t?.toLowerCase() === occasion,
        ),
    );
  return (
    <p>
      {matches.length
        ? matches.map((i) => i!.name).join(", ") +
          " matches " +
          look.occasion +
          "."
        : look.outfit_items
            .map(
              (p) => garmentFor(items, p.item_id)?.name || "Unavailable item",
            )
            .join(" · ")}{" "}
      {absent.length ? "Still open: " + absent.join(", ") + "." : ""}
    </p>
  );
}
export default function Outfits({ items, userId, startId, db }: Props) {
  const [library, setLibrary] = useState<Look[]>([]);
  const [look, setLook] = useState<Look | null>(null);
  const [tab, setTab] = useState<"saved" | "builder" | "compare">("saved");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const modalOpener = useRef<HTMLElement | null>(null);
  const [picker, setPicker] = useState<Slot | null>(null);
  const [suggestions, setSuggestions] = useState<Look[]>([]),
    [index, setIndex] = useState(0);
  const [compare, setCompare] = useState<Look[]>([]);
  const [confirm, setConfirm] = useState<Look | null>(null);
  const [style, setStyle] = useState<Style>(defaultStyle);
  const [feedback, setFeedback] = useState<Record<string, number>>({});
  const [exclusions, setExclusions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const round = useRef(0),
    seenStart = useRef(""),
    touch = useRef<{ x: number; y: number } | null>(null);
  const serial = useRef(Promise.resolve()),
    latest = useRef<Look | null>(null),
    versions = useRef(new Map<string, number>());
  useEffect(() => {
    const title = {
      saved: "Saved looks",
      builder: "Outfit builder",
      compare: "Compare looks",
    };
    document.title = title[tab] + " · " + brand.name;
  }, [tab]);
  const bufferKey = "outfit-draft/" + userId;
  const fetchLibrary = useCallback(async () => {
    const byId = new Map<string, Look>();
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error: failure } = await db
        .from("outfits")
        .select(lookFields)
        .eq("owner_id", userId)
        .order("updated_at", { ascending: false })
        .order("id")
        .range(offset, offset + pageSize - 1);
      if (failure) throw failure;
      for (const row of (data || []) as Look[]) byId.set(row.id, row);
      if (!data || data.length < pageSize) break;
    }
    const all = [...byId.values()];
    setLibrary(all);
    return all;
  }, [db, userId]);
  const load = useCallback(async () => {
    try {
      const [all, r, p] = await Promise.all([
        fetchLibrary(),
        db
          .from("outfit_feedback")
          .select("signature,rating")
          .eq("owner_id", userId),
        db
          .from("preferences")
          .select("preferred_colors,style,layers,favorites")
          .eq("owner_id", userId)
          .maybeSingle(),
      ]);
      if (r.error || p.error) throw r.error || p.error;
      setFeedback(
        Object.fromEntries((r.data || []).map((x) => [x.signature, x.rating])),
      );
      setStyle(
        p.data
          ? {
              colors: p.data.preferred_colors.join(", "),
              personalStyle: p.data.style,
              layers: p.data.layers,
              favorites: p.data.favorites,
            }
          : defaultStyle,
      );
      const pending = sessionStorage.getItem(bufferKey);
      if (pending && !latest.current) {
        const saved = JSON.parse(pending) as Look;
        const existing = all.find((l) => l.id === saved.id);
        if (existing && existing.version !== saved.version) {
          setError(
            "A newer version of your draft exists. Reopen it or save your local edits as a copy.",
          );
          setBlocked(true);
        }
        setLook(saved);
        latest.current = saved;
        setTab("builder");
      } else if (!latest.current && all.find((l) => l.status === "draft")) {
        const draft = all.find((l) => l.status === "draft")!;
        setLook(draft);
        latest.current = draft;
      }
      setLoaded(true);
    } catch (e) {
      setError(errorText(e));
    }
  }, [bufferKey, db, fetchLibrary, userId]);
  useEffect(() => {
    void load();
  }, [load]);

  // Serial writes and database version checks protect earlier edits in flight.
  // A tab-scoped, account-specific recovery buffer covers offline changes.
  function persist(data: Look, explicit = false, editing = true) {
    setStatus("Saving…");
    setError("");
    const write = async () => {
      const { data: version, error: failure } = await db.rpc("save_outfit", {
        p_id: data.id,
        p_version: editing
          ? (versions.current.get(data.id) ?? data.version)
          : data.version,
        p_name: data.name.trim() || "Untitled look",
        p_occasion: data.occasion,
        p_notes: data.notes,
        p_favorite: data.favorite,
        p_status: data.status,
        p_slots: data.outfit_items,
      });
      if (failure) {
        setBlocked(true);
        throw failure;
      }
      versions.current.set(data.id, version);
      const stored = {
        ...data,
        name: data.name.trim() || "Untitled look",
        version: Number(version),
      };
      setLibrary((old) => [stored, ...old.filter((l) => l.id !== stored.id)]);
      if (
        latest.current === data ||
        (latest.current?.id === data.id && !sessionStorage.getItem(bufferKey))
      ) {
        latest.current = stored;
        setLook(stored);
        sessionStorage.removeItem(bufferKey);
        setStatus(explicit ? "Look saved." : "Draft saved.");
      } else if (editing && latest.current?.id === data.id) {
        sessionStorage.setItem(
          bufferKey,
          JSON.stringify({ ...latest.current, version }),
        );
      }
      return stored;
    };
    const work = serial.current.then(write);
    serial.current = work.then(
      () => {},
      (e) => {
        setError(errorText(e));
        setStatus("Changes need saving.");
      },
    );
    return work;
  }
  function openEditor(data: Look) {
    if (
      latest.current &&
      sessionStorage.getItem(bufferKey) &&
      latest.current.id !== data.id
    ) {
      setError(
        "Save or discard the current draft changes before opening another look.",
      );
      setTab("builder");
      return;
    }
    latest.current = data;
    setLook(data);
    setTab("builder");
    setStatus("");
    setError("");
    setBlocked(false);
    setSuggestions([]);
    setPicker(null);
  }
  function edit(data: Look) {
    setSuggestions([]);
    setLook(data);
    latest.current = data;
    sessionStorage.setItem(bufferKey, JSON.stringify(data));
    setStatus("Unsaved changes");
    setError("");
  }
  useEffect(() => {
    if (
      !look ||
      blocked ||
      look.status !== "draft" ||
      !sessionStorage.getItem(bufferKey)
    )
      return;
    const timer = setTimeout(() => {
      void persist(look).catch(() => {});
    }, 350);
    return () => clearTimeout(timer);
    // The saved object and buffer are updated together by persist.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [look, blocked, bufferKey]);
  useEffect(() => {
    if (!loaded || !startId || seenStart.current === startId) return;
    const item = items.find((i) => i.id === startId);
    if (!item) return;
    const slot = slots.find((s) => fits(item, s));
    seenStart.current = startId;
    if (!slot || !eligible(item, userId)) {
      setError("This garment is unavailable for styling.");
      return;
    }
    if (sessionStorage.getItem(bufferKey)) {
      setError("Save your pending changes before styling another item.");
      return;
    }
    const fresh = {
      ...newLook(),
      name: "Look with " + item.name.slice(0, 100),
      outfit_items: [{ slot, item_id: item.id, locked: true }],
    };
    openEditor(fresh);
    edit(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, startId, items, userId, bufferKey]);
  function changeSlot(slot: Slot, item: Item) {
    if (!look) return;
    try {
      edit({
        ...look,
        outfit_items: place(look.outfit_items, slot, item, userId),
      });
      setPicker(null);
      setSuggestions([]);
    } catch (e) {
      setError(errorText(e));
    }
  }
  function changePreferences(update: Partial<Style>) {
    setSuggestions([]);
    setStyle((s) => ({ ...s, ...update }));
  }
  function generate() {
    if (!look) return;
    try {
      const result = recommend(items, {
        owner: userId,
        locked: look.outfit_items,
        occasion: look.occasion,
        colors: style.colors.split(","),
        style: style.personalStyle,
        layers: style.layers,
        favorites: style.favorites,
        feedback,
        excluded: exclusions,
        round: round.current++,
        previouslyShown: suggestions.map((s) => signature(s.outfit_items)),
      });
      setSuggestions(
        result.map((p, i) => ({
          ...newLook(),
          name: (look.occasion || "Everyday") + " look " + (i + 1),
          occasion: look.occasion,
          outfit_items: p,
        })),
      );
      setIndex(0);
      setError(
        result.length
          ? ""
          : "No available combinations match. Change the exclusions or add a garment.",
      );
    } catch (e) {
      setSuggestions([]);
      setError(errorText(e));
    }
  }
  async function rate(data: Look, rating: number) {
    const key = signature(data.outfit_items);
    if (!key) return;
    const r = await db
      .from("outfit_feedback")
      .upsert({ owner_id: userId, signature: key, rating });
    if (r.error) {
      setError(errorText(r.error));
      return;
    }
    setFeedback({ ...feedback, [key]: rating });
    setStatus(
      rating < 0
        ? "Combination excluded from future suggestions."
        : "Preference saved.",
    );
    if (rating < 0) {
      setSuggestions(suggestions.filter((s) => s.id !== data.id));
      setIndex(0);
    }
  }
  function compareLook(data: Look) {
    setCompare((old) => {
      const rest = old.filter((l) => l.id !== data.id);
      return [...rest.slice(-1), data];
    });
    setStatus("Added " + data.name + " to comparison.");
  }
  async function save(data: Look, editing = false) {
    if (
      !editing &&
      latest.current &&
      latest.current.id !== data.id &&
      sessionStorage.getItem(bufferKey)
    ) {
      setError("Save or discard the current edits before saving another look.");
      setTab("builder");
      return;
    }
    const saved = { ...data, status: "saved" as const };
    if (!saved.outfit_items.length) {
      setError("Add an item before saving your look.");
      return;
    }
    edit(saved);
    try {
      await persist(saved, true, editing);
      setBlocked(false);
      setTab("saved");
      setSuggestions([]);
    } catch {
      /* write displays recovery options */
    }
  }
  function duplicate(data: Look) {
    const copy = {
      ...data,
      id: crypto.randomUUID(),
      name: (data.name + " copy").slice(0, 120),
      version: 0,
      status: "draft" as const,
      outfit_items: data.outfit_items.filter((p) =>
        items.some(
          (i) => i.id === p.item_id && fits(i, p.slot) && eligible(i, userId),
        ),
      ),
    };
    openEditor(copy);
    if (latest.current === copy) edit(copy);
  }
  async function discardLocal() {
    try {
      const all = await fetchLibrary();
      const current = all.find((l) => l.id === look?.id) || newLook();
      sessionStorage.removeItem(bufferKey);
      versions.current.delete(current.id);
      openEditor(current);
      setStatus("Latest version loaded.");
    } catch (e) {
      setError(errorText(e));
    }
  }
  const available = items.filter((i) => eligible(i, userId));
  const shown = library.filter(
    (l) =>
      (filter === "All" ||
        (filter === "Favorites" ? l.favorite : l.status === filter)) &&
      [l.name, l.occasion]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const current = suggestions[index];
  const changes =
    compare[0] && compare[1]
      ? slots.filter(
          (slot) =>
            compare[0].outfit_items.find((p) => p.slot === slot)?.item_id !==
            compare[1].outfit_items.find((p) => p.slot === slot)?.item_id,
        ).length
      : 0;
  const changeIndex = (direction: number) =>
    setIndex((i) =>
      Math.min(suggestions.length - 1, Math.max(0, i + direction)),
    );
  return (
    <section className="looks-workspace" aria-label="Outfits">
      <h1>Outfits</h1>
      <div className="looks-toolbar">
        <div className="looks-tabs">
          {(["saved", "builder", "compare"] as const).map((t, i) => (
            <button
              key={t}
              aria-pressed={tab === t}
              onClick={() => {
                setTab(t);
                if (t === "builder" && !look) openEditor(newLook());
              }}
            >
              {["Saved looks", "Outfit builder", "Compare"][i]}
              {t === "compare" && compare.length > 0
                ? " (" + compare.length + ")"
                : ""}
            </button>
          ))}
        </div>
        {tab !== "builder" && (
          <button
            className="look-primary"
            onClick={() => openEditor(newLook())}
          >
            <Plus size={18} />
            Create outfit
          </button>
        )}
      </div>
      <p role="status" className="look-status">
        {status}
      </p>
      {error && (
        <div role="alert" className="look-error">
          {error}{" "}
          {!loaded && (
            <button onClick={() => void load()}>Retry loading</button>
          )}
        </div>
      )}
      {!loaded && !error && <p role="status">Loading your looks…</p>}
      {tab === "saved" && loaded && (
        <>
          <div className="looks-filter">
            <label>
              Search looks
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or occasion"
              />
            </label>
            <label>
              Show
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  ["All", "All looks"],
                  ["saved", "Saved"],
                  ["draft", "Drafts"],
                  ["Favorites", "Favorites"],
                ].map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!shown.length ? (
            <div className="look-empty">
              <Layers size={36} />
              <h3>
                {library.length
                  ? "No matching looks"
                  : "Your first look starts here"}
              </h3>
              <p>
                {library.length
                  ? "Try a different name or filter."
                  : "Pair pieces from your wardrobe, then save the combinations you love."}
              </p>
            </div>
          ) : (
            <div className="looks-grid">
              {shown.map((l) => (
                <article className="look-card" key={l.id}>
                  <MiniBoard picks={l.outfit_items} items={items} />
                  <h3>{l.name}</h3>
                  <p>
                    {[
                      l.status === "draft" ? "Draft" : "Saved",
                      l.occasion,
                      l.outfit_items.length + " pieces",
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <div className="look-actions">
                    <button onClick={() => openEditor(l)}>Edit</button>
                    <button
                      aria-label={"Favorite " + l.name}
                      aria-pressed={l.favorite}
                      onClick={() =>
                        void persist(
                          { ...l, favorite: !l.favorite },
                          true,
                          false,
                        )
                          .then(() => setStatus("Favorite updated."))
                          .catch(() => {})
                      }
                    >
                      <Heart
                        size={16}
                        fill={l.favorite ? "currentColor" : "none"}
                      />
                    </button>
                    <button onClick={() => compareLook(l)}>Compare</button>
                    <button onClick={() => duplicate(l)}>Duplicate</button>
                    <button
                      onClick={(e) => {
                        modalOpener.current = e.currentTarget;
                        setConfirm(l);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {tab === "builder" && look && (
        <>
          <div className="look-editor-title">
            <h2>Outfit board</h2>
            <p>Arrange your pieces to explore a combination.</p>
          </div>
          <div className="look-builder">
            <div className="look-board">
              {slots.map((slot) => {
                const pick = look.outfit_items.find((p) => p.slot === slot),
                  item = garmentFor(items, pick?.item_id),
                  url = imageFor(item);
                const unavailable =
                  pick &&
                  (!item || !eligible(item, userId) || !fits(item, slot));
                const candidates = available.filter(
                  (i) =>
                    fits(i, slot) &&
                    !look.outfit_items.some((p) => p.item_id === i.id),
                );
                const baseConflict = look.outfit_items.some((p) =>
                  conflict(slot, p.slot),
                );
                return (
                  <div
                    className={"look-slot" + (pick ? " filled" : "")}
                    key={slot}
                    onDragOver={(e) => {
                      if (!pick?.locked) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const target = garmentFor(
                        items,
                        e.dataTransfer.getData("application/x-wardrobe-item"),
                      );
                      if (target) changeSlot(slot, target);
                    }}
                  >
                    <div className="slot-heading">
                      <strong>{slot}</strong>
                      {pick && (
                        <button
                          aria-label={
                            (pick.locked ? "Unlock " : "Lock ") + slot
                          }
                          aria-pressed={pick.locked}
                          onClick={() =>
                            edit({
                              ...look,
                              outfit_items: look.outfit_items.map((p) =>
                                p.slot === slot
                                  ? { ...p, locked: !p.locked }
                                  : p,
                              ),
                            })
                          }
                        >
                          {pick.locked ? (
                            <LockKeyhole size={15} />
                          ) : (
                            <LockKeyholeOpen size={15} />
                          )}
                        </button>
                      )}
                    </div>
                    <button
                      disabled={pick?.locked}
                      className="pick-slot"
                      onClick={(e) => {
                        modalOpener.current = e.currentTarget;
                        setPicker(slot);
                      }}
                      aria-label={(pick ? "Replace " : "Choose ") + slot}
                    >
                      {url && !unavailable ? (
                        <img src={url} alt={item!.name} />
                      ) : (
                        <Plus size={18} />
                      )}
                      <span>
                        {unavailable
                          ? "Unavailable · replace item"
                          : item?.name ||
                            (baseConflict ? "Switch base" : "Choose item")}
                      </span>
                    </button>
                    {pick && !pick.locked && (
                      <div className="slot-actions">
                        <button
                          disabled={!candidates.length}
                          onClick={() => changeSlot(slot, candidates[0])}
                        >
                          Swap
                        </button>
                        <button
                          aria-label={"Remove " + slot}
                          onClick={() =>
                            edit({
                              ...look,
                              outfit_items: look.outfit_items.filter(
                                (p) => p.slot !== slot,
                              ),
                            })
                          }
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <aside className="look-details">
              <h3>Look details</h3>
              <label>
                Name
                <input
                  value={look.name}
                  maxLength={120}
                  onChange={(e) => edit({ ...look, name: e.target.value })}
                />
              </label>
              <label>
                Occasion
                <input
                  value={look.occasion}
                  maxLength={80}
                  onChange={(e) => edit({ ...look, occasion: e.target.value })}
                  placeholder="e.g. Office"
                />
              </label>
              <label>
                Notes
                <textarea
                  rows={2}
                  value={look.notes}
                  maxLength={2000}
                  onChange={(e) => edit({ ...look, notes: e.target.value })}
                />
              </label>
              <label className="look-check">
                <input
                  type="checkbox"
                  checked={look.favorite}
                  onChange={(e) =>
                    edit({ ...look, favorite: e.target.checked })
                  }
                />
                Favorite look
              </label>
              <button
                className="look-primary"
                disabled={!look.outfit_items.length || blocked}
                onClick={() => void save(look, true)}
              >
                Save look
              </button>
              <button
                onClick={() => compareLook(look)}
                disabled={!look.outfit_items.length}
              >
                <Columns2 size={16} />
                Add to comparison
              </button>
              {!blocked &&
                look.status === "saved" &&
                status === "Unsaved changes" && (
                  <button onClick={() => void discardLocal()}>
                    Discard unsaved edits
                  </button>
                )}
              {blocked && (
                <>
                  <button
                    onClick={() => {
                      setBlocked(false);
                      void persist(look)
                        .then(() => setBlocked(false))
                        .catch(() => {});
                    }}
                  >
                    Retry save
                  </button>
                  <button
                    onClick={() => {
                      sessionStorage.removeItem(bufferKey);
                      duplicate(look);
                    }}
                  >
                    Keep edits as a copy
                  </button>
                  <button onClick={() => void discardLocal()}>
                    Discard local edits and reload
                  </button>
                </>
              )}
              <details
                className="look-picker-inline"
                open={available.length > 0}
              >
                <summary>Wardrobe picker ({available.length})</summary>
                <p>Select a piece or drag it to a matching slot.</p>
                <div className="picker-grid">
                  {available.map((i) => (
                    <button
                      key={i.id}
                      draggable
                      onDragStart={(e) =>
                        e.dataTransfer.setData(
                          "application/x-wardrobe-item",
                          i.id,
                        )
                      }
                      onClick={() => {
                        const suitable = slots.filter((s) => fits(i, s));
                        const target =
                          suitable.find(
                            (s) => !look.outfit_items.some((p) => p.slot === s),
                          ) || suitable[0];
                        if (target) changeSlot(target, i);
                      }}
                    >
                      {imageFor(i) && (
                        <img src={imageFor(i)} alt="" loading="lazy" />
                      )}
                      {i.name}
                    </button>
                  ))}
                </div>
                {!available.length && (
                  <p>Add and review a garment to start your outfit.</p>
                )}
              </details>
            </aside>
          </div>
          <div className="look-suggest">
            <h2>Outfit suggestions</h2>
            <p>
              Use available pieces from your wardrobe. Locked slots stay in
              place.
            </p>
            <details>
              <summary>Style preferences and exclusions</summary>
              <div className="look-pref">
                <label>
                  Personal style
                  <input
                    value={style.personalStyle}
                    maxLength={120}
                    onChange={(e) =>
                      changePreferences({ personalStyle: e.target.value })
                    }
                  />
                </label>
                <label>
                  Preferred colors
                  <input
                    value={style.colors}
                    maxLength={160}
                    placeholder="Olive, cream"
                    onChange={(e) =>
                      changePreferences({ colors: e.target.value })
                    }
                  />
                </label>
                <label className="look-check">
                  <input
                    type="checkbox"
                    checked={style.layers}
                    onChange={(e) =>
                      changePreferences({ layers: e.target.checked })
                    }
                  />
                  Add an outer layer
                </label>
                <label className="look-check">
                  <input
                    type="checkbox"
                    checked={style.favorites}
                    onChange={(e) =>
                      changePreferences({ favorites: e.target.checked })
                    }
                  />
                  Prefer favorite pieces
                </label>
                <button
                  onClick={async () => {
                    const { error: e } = await db.from("preferences").upsert(
                      {
                        owner_id: userId,
                        preferred_colors: style.colors
                          .split(",")
                          .map((v) => v.trim())
                          .filter(Boolean),
                        style: style.personalStyle,
                        layers: style.layers,
                        favorites: style.favorites,
                      },
                      { defaultToNull: false },
                    );
                    if (e) setError(errorText(e));
                    else setStatus("Style preferences saved.");
                  }}
                >
                  Save preferences
                </button>
                <fieldset>
                  <legend>Exclude pieces from suggestions</legend>
                  {available.map((i) => (
                    <label key={i.id} className="look-check">
                      <input
                        type="checkbox"
                        checked={exclusions.includes(i.id)}
                        onChange={(e) => {
                          setSuggestions([]);
                          setExclusions(
                            e.target.checked
                              ? [...exclusions, i.id]
                              : exclusions.filter((id) => id !== i.id),
                          );
                        }}
                      />
                      {i.name}
                    </label>
                  ))}
                </fieldset>
              </div>
            </details>
            <button onClick={generate}>
              <RefreshCw size={16} />
              {current ? "Suggest alternatives" : "Suggest outfits"}
            </button>
            {current && (
              <article
                className="look-suggestion-card"
                onTouchStart={(e) => {
                  touch.current = {
                    x: e.touches[0].clientX,
                    y: e.touches[0].clientY,
                  };
                }}
                onTouchEnd={(e) => {
                  if (!touch.current) return;
                  const dx = e.changedTouches[0].clientX - touch.current.x,
                    dy = e.changedTouches[0].clientY - touch.current.y;
                  if (
                    touch.current.x > 32 &&
                    touch.current.x < window.innerWidth - 32 &&
                    Math.abs(dx) > 64 &&
                    Math.abs(dx) > 2 * Math.abs(dy)
                  )
                    changeIndex(dx < 0 ? 1 : -1);
                  touch.current = null;
                }}
              >
                <div className="look-pager">
                  <button
                    disabled={index === 0}
                    onClick={() => changeIndex(-1)}
                  >
                    Previous
                  </button>
                  <span aria-live="polite">
                    {index + 1} of {suggestions.length}
                  </span>
                  <button
                    disabled={index >= suggestions.length - 1}
                    onClick={() => changeIndex(1)}
                  >
                    Next
                  </button>
                </div>
                <MiniBoard picks={current.outfit_items} items={items} />
                <h3>{current.name}</h3>
                <LookSummary look={current} items={items} />
                <div className="look-actions">
                  <button
                    onClick={() => {
                      edit({ ...look, outfit_items: current.outfit_items });
                      setSuggestions([]);
                    }}
                  >
                    Use on board
                  </button>
                  <button onClick={() => compareLook(current)}>Compare</button>
                  <button onClick={() => void rate(current, 1)}>Like</button>
                  <button onClick={() => void rate(current, -1)}>
                    Dislike
                  </button>
                </div>
              </article>
            )}
          </div>
        </>
      )}
      {picker && look && (
        <Modal
          opener={modalOpener.current}
          name={"Choose " + picker.toLowerCase()}
          close={() => setPicker(null)}
        >
          {look.outfit_items.some((p) => conflict(p.slot, picker)) && (
            <p>
              Choosing here replaces the current base pieces. Unlock them first
              if needed.
            </p>
          )}
          <div className="picker-grid">
            {available
              .filter((i) => fits(i, picker))
              .map((i) => (
                <button key={i.id} onClick={() => changeSlot(picker, i)}>
                  {imageFor(i) && <img src={imageFor(i)} alt="" />}
                  {i.name}
                </button>
              ))}
          </div>
          {!available.some((i) => fits(i, picker)) && (
            <p>No available pieces fit this slot yet.</p>
          )}
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
      {tab === "compare" && (
        <>
          <h2>Compare looks</h2>
          <div className="looks-filter">
            {[0, 1].map((n) => {
              const choices = Array.from(
                new Map(
                  [
                    ...compare,
                    ...library,
                    ...suggestions,
                    ...(look ? [look] : []),
                  ]
                    .filter(Boolean)
                    .map((l) => [l.id, l]),
                ).values(),
              ).filter(
                (l) => l.outfit_items.length && l.id !== compare[1 - n]?.id,
              );
              return (
                <label key={n}>
                  Look {n === 0 ? "A" : "B"}
                  <select
                    value={compare[n]?.id || ""}
                    onChange={(e) => {
                      const l = choices.find((c) => c.id === e.target.value);
                      if (l)
                        setCompare((old) => {
                          const next = old.slice();
                          next[n] = l;
                          return next;
                        });
                    }}
                  >
                    <option value="">Select a look</option>
                    {choices.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          {compare[0] && compare[1] ? (
            <>
              <p>
                {changes} changed {changes === 1 ? "slot" : "slots"}
              </p>
              <div className="compare-boards">
                {compare.map((l, n) => (
                  <article className="look-card" key={l.id}>
                    <h3>
                      {n ? "B" : "A"} · {l.name}
                    </h3>
                    <p>{l.occasion || "No occasion set"}</p>
                    {slots
                      .filter((s) =>
                        compare.some((c) =>
                          c.outfit_items.some((p) => p.slot === s),
                        ),
                      )
                      .map((s) => {
                        const pick = l.outfit_items.find((p) => p.slot === s),
                          i = garmentFor(items, pick?.item_id),
                          shared =
                            !!pick?.item_id &&
                            compare[1 - n].outfit_items.some(
                              (p) => p.slot === s && p.item_id === pick.item_id,
                            );
                        return (
                          <div className="compare-slot" key={s}>
                            {i &&
                            eligible(i, userId) &&
                            fits(i, s) &&
                            imageFor(i) ? (
                              <img src={imageFor(i)} alt="" />
                            ) : (
                              <span aria-hidden="true">—</span>
                            )}
                            <div>
                              <strong>{s}</strong>
                              <p>
                                {pick
                                  ? i && eligible(i, userId) && fits(i, s)
                                    ? i.name
                                    : "Unavailable · replace in editor"
                                  : "Open slot"}
                              </p>
                              <small>{shared ? "Shared" : "Changed"}</small>
                            </div>
                          </div>
                        );
                      })}
                    <div className="look-actions">
                      <button
                        onClick={() => {
                          if (!look) {
                            openEditor(l);
                            return;
                          }
                          edit({
                            ...look,
                            outfit_items: l.outfit_items,
                            occasion: l.occasion,
                          });
                          setSuggestions([]);
                          setTab("builder");
                        }}
                      >
                        Choose this look
                      </button>
                      <button onClick={() => openEditor(l)}>Edit</button>
                      <button onClick={() => void save(l)}>Save</button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="look-empty">
              <Columns2 size={32} />
              <h3>Choose two looks</h3>
              <p>
                Compare looks from your saved outfits, suggestions, or current
                board.
              </p>
            </div>
          )}
        </>
      )}
      {confirm && (
        <Modal
          opener={modalOpener.current}
          name="Delete look?"
          close={() => setConfirm(null)}
        >
          <p>Delete “{confirm.name}”? Its garments stay in your wardrobe.</p>
          <div className="look-actions">
            <button onClick={() => setConfirm(null)}>Keep look</button>
            <button
              onClick={async () => {
                const l = confirm;
                const { data, error: e } = await db
                  .from("outfits")
                  .delete()
                  .eq("id", l.id)
                  .eq("version", l.version)
                  .select("id");
                if (e || !data?.length) {
                  setError(
                    e
                      ? errorText(e)
                      : "The look changed. Reload before deleting.",
                  );
                  setConfirm(null);
                  return;
                }
                setLibrary((old) => old.filter((v) => v.id !== l.id));
                setCompare((old) => old.filter((v) => v.id !== l.id));
                if (latest.current?.id === l.id) {
                  setLook(null);
                  latest.current = null;
                  sessionStorage.removeItem(bufferKey);
                }
                setConfirm(null);
                setStatus("Look deleted.");
              }}
            >
              Delete look
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
