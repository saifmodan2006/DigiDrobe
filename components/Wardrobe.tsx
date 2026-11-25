import { useEffect, useMemo, useState } from "react";
import { Heart, Search, Shirt, SlidersHorizontal } from "lucide-react";
import type { Item } from "../lib/model";
import { categories, availability } from "../lib/config";
import { db, checked, message } from "../lib/client";
type Props = {
  userId: string;
  items: Item[];
  page: string;
  param?: string;
  go: (v: string) => void;
  refresh: () => Promise<void>;
  tell: (v: string) => void;
};
export default function Wardrobe({
  userId,
  items,
  page,
  param,
  go,
  refresh,
  tell,
}: Props) {
  const [category, group] = useState("All items"),
    [query, search] = useState(""),
    [order, sort] = useState("Newest"),
    [state, filter] = useState("Any availability"),
    [limit, more] = useState(24),
    [open, expand] = useState(false),
    [members, include] = useState<string[]>([]),
    [collectionName, name] = useState("");
  useEffect(() => {
    const v = sessionStorage.getItem("wardrobe-filters-" + userId);
    if (v)
      try {
        const f = JSON.parse(v);
        group(f.category);
        search(f.query);
        sort(f.order);
        filter(f.state);
      } catch {}
  }, []);
  function remember() {
    sessionStorage.setItem(
      "wardrobe-filters-" + userId,
      JSON.stringify({ category, query, order, state }),
    );
  }
  useEffect(() => {
    let live = true;
    if (page === "Collection" && param) {
      Promise.all([
        db!
          .from("collection_items")
          .select("item_id")
          .eq("collection_id", param),
        db!.from("collections").select("name").eq("id", param).single(),
      ]).then(([rows, collection]) => {
        if (live) {
          if (rows.error || collection.error)
            tell("Collection could not be loaded.");
          include((rows.data || []).map((r) => r.item_id));
          name(collection.data?.name || "");
        }
      });
    }
    return () => {
      live = false;
    };
  }, [page, param, tell]);
  const visible = useMemo(
    () =>
      items.filter((i) =>
        page === "Trash"
          ? i.deleted_at
          : !i.deleted_at &&
            (page === "Needs review"
              ? i.status !== "ready"
              : i.status === "ready") &&
            (page !== "Favorites" || i.favorite) &&
            (page !== "Collection" || members.includes(i.id)),
      ),
    [items, page, members],
  );
  const results = visible
    .filter(
      (i) =>
        (category === "All items" || category === i.category) &&
        (state === "Any availability" || state === i.availability) &&
        [i.name, i.color, i.category, i.subtype, ...(i.tags || [])]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      order === "Name A–Z"
        ? a.name.localeCompare(b.name)
        : order === "Oldest"
          ? a.created_at.localeCompare(b.created_at)
          : b.created_at.localeCompare(a.created_at),
    );
  async function favorite(i: Item) {
    try {
      checked(
        await db!
          .from("items")
          .update({ favorite: !i.favorite })
          .eq("id", i.id)
          .select()
          .single(),
      );
      await refresh();
      tell(i.favorite ? "Removed from favorites." : "Added to favorites.");
    } catch (e) {
      tell(message(e));
    }
  }
  return (
    <>
      <p className="intro">
        {collectionName && page === "Collection" ? collectionName + " · " : ""}
        {visible.length} {visible.length === 1 ? "piece" : "pieces"}
      </p>
      <div className="toolbar">
        <label className="search">
          <Search size={19} />
          <span className="sr">Search wardrobe</span>
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="Search your wardrobe"
          />
        </label>
        <button aria-expanded={open} onClick={() => expand(!open)}>
          <SlidersHorizontal size={17} />
          Filters
        </button>
      </div>
      {open && (
        <div className="fields">
          <label>
            Availability
            <select value={state} onChange={(e) => filter(e.target.value)}>
              {["Any availability", ...availability].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
          <label>
            Sort by
            <select value={order} onChange={(e) => sort(e.target.value)}>
              {["Newest", "Oldest", "Name A–Z"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="chips">
        {["All items", ...Object.keys(categories)].map((v) => (
          <button
            aria-pressed={category === v}
            key={v}
            onClick={() => group(v)}
          >
            {v}
          </button>
        ))}
      </div>
      {results.length ? (
        <div className="garments">
          {results.slice(0, limit).map((i) => (
            <article className="card" key={i.id}>
              <button
                className="garment-link"
                onClick={() => {
                  remember();
                  go("Item/" + i.id);
                }}
              >
                <span className="stage">
                  {(i.thumbnail || i.original) && !i.deleted_at ? (
                    <img
                      loading="lazy"
                      alt={i.name}
                      src={i.thumbnail || i.original}
                    />
                  ) : (
                    <Shirt />
                  )}
                </span>
                <strong>{i.name}</strong>
                <small>
                  {i.status === "ready"
                    ? i.category
                    : i.status.replaceAll("_", " ")}
                </small>
              </button>
              {!i.deleted_at && (
                <button
                  className="heart"
                  aria-label={"Favorite " + i.name}
                  aria-pressed={i.favorite}
                  onClick={() => favorite(i)}
                >
                  <Heart fill={i.favorite ? "currentColor" : "none"} />
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="empty">
          <Shirt size={40} />
          <h2>
            {visible.length
              ? "No matching pieces"
              : page === "Wardrobe"
                ? "Your wardrobe starts here"
                : page === "Trash"
                  ? "Trash is empty"
                  : page === "Needs review"
                    ? "You’re all caught up"
                    : "No pieces here yet"}
          </h2>
          <p>
            {visible.length
              ? "Try a different search or filter."
              : page === "Wardrobe"
                ? "Add a photo of your first piece to start planning outfits."
                : page === "Trash"
                  ? "Removed items appear here for recovery."
                  : page === "Favorites"
                    ? "Favorite a piece to find it here."
                    : "Your wardrobe changes will appear here."}
          </p>
          {visible.length > 0 && (
            <button
              onClick={() => {
                group("All items");
                search("");
                filter("Any availability");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {results.length > limit && (
        <button onClick={() => more(limit + 24)}>Load more pieces</button>
      )}
    </>
  );
}
