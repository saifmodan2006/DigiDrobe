import { useEffect, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { categories, availability } from "../lib/config";
import { db, photo, checked, message } from "../lib/client";
import type { Item } from "../lib/model";
type Props = {
  item: Item;
  go: (route: string) => void;
  refresh: () => Promise<void>;
  tell: (s: string) => void;
  styleItem: (id: string) => void;
};
export default function Detail({ item, go, refresh, styleItem }: Props) {
  const [tab, setTab] = useState("Cutout"),
    [zoom, magnify] = useState(1),
    [note, announce] = useState(""),
    [busy, wait] = useState(false),
    [saved, confirm] = useState(false),
    [category, group] = useState(item.category || ""),
    [subtype, type] = useState(item.subtype || ""),
    [permanent, ask] = useState(false);
  const [collections, list] = useState<{ id: string; name: string }[]>([]),
    [members, include] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    Promise.all([
      db!.from("collections").select("id,name").order("name"),
      db!
        .from("collection_items")
        .select("collection_id")
        .eq("item_id", item.id),
    ]).then(([all, rows]) => {
      if (!live) return;
      if (all.error || rows.error) announce("Unable to load collections.");
      else {
        list(all.data);
        include(rows.data.map((r) => r.collection_id));
      }
    });
    return () => {
      live = false;
    };
  }, [item.id]);
  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    wait(true);
    announce("");
    try {
      await action();
      await refresh();
      announce(success);
    } catch (e) {
      announce(message(e));
    } finally {
      wait(false);
    }
  }
  const invoke = (action: string) =>
    photo({ action, itemId: item.id, revision: item.revision });
  const ready = item.status === "ready",
    editable = ready || item.status === "needs_review",
    processing = item.status === "queued" || item.status === "running",
    activeTab = item.cutout ? tab : "Original",
    picture = tab === "Original" || !item.cutout ? item.original : item.cutout;
  return (
    <>
      <button
        className="text-button"
        onClick={() =>
          go(item.deleted_at ? "Trash" : ready ? "Wardrobe" : "Needs review")
        }
      >
        Back to{" "}
        {item.deleted_at ? "Trash" : ready ? "wardrobe" : "Needs review"}
      </button>
      <h1>{item.name}</h1>
      <div role="status" aria-live="polite">
        {note && <p className="notice">{note}</p>}
      </div>
      {item.deleted_at ? (
        <section className="panel">
          <h2>In Trash</h2>
          <div className="actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await invoke("restore");
                }, "Item restored.")
              }
            >
              Restore item
            </button>
            <button disabled={busy} onClick={() => ask(true)}>
              Delete permanently
            </button>
          </div>
          {permanent && (
            <div>
              <p>This removes the item and its photos permanently.</p>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await invoke("purge");
                    go("Trash");
                  }, "Item removed.")
                }
              >
                Confirm deletion
              </button>{" "}
              <button onClick={() => ask(false)}>Cancel</button>
            </div>
          )}
        </section>
      ) : (
        <>
          <p className="intro" role="status">
            {ready
              ? item.category
              : item.status === "needs_review"
                ? "Needs review"
                : item.status === "running"
                  ? "Removing background…"
                  : item.status === "queued"
                    ? "Queued for background removal"
                    : item.error_code?.includes("provider")
                      ? "Background removal unavailable. Your draft is saved."
                      : item.status === "failed"
                        ? "Processing failed. Your draft is saved."
                        : "Photo draft"}
          </p>
          <div className="detail">
            <section>
              <div className="switcher">
                {["Original", "Cutout"].map((v) => (
                  <button
                    key={v}
                    aria-pressed={v === activeTab}
                    disabled={v === "Cutout" && !item.cutout}
                    onClick={() => setTab(v)}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <div className="review-stage">
                {picture ? (
                  <img
                    src={picture}
                    alt={
                      item.name +
                      " — " +
                      (picture === item.original ? "original" : "cutout")
                    }
                    style={{
                      width: zoom * 100 + "%",
                      maxWidth: "none",
                      height: zoom * 100 + "%",
                    }}
                  />
                ) : (
                  <p>Photo pending</p>
                )}
              </div>
              <div className="actions">
                <button
                  aria-label="Zoom out"
                  onClick={() => magnify(Math.max(1, zoom - 0.5))}
                >
                  <ZoomOut />
                </button>
                <button
                  aria-label="Zoom in"
                  onClick={() => magnify(Math.min(3, zoom + 0.5))}
                >
                  <ZoomIn />
                </button>
                <button onClick={() => magnify(1)}>
                  <RotateCcw size={16} />
                  Reset zoom
                </button>
              </div>
            </section>
            <section className="panel">
              {editable ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fields = Object.fromEntries(
                      new FormData(e.currentTarget),
                    );
                    void run(async () => {
                      const tags = String(fields.tags || "")
                        .split(",")
                        .map((v) => v.trim())
                        .filter(Boolean);
                      checked(
                        await db!
                          .from("items")
                          .update({
                            ...fields,
                            name: String(fields.name).trim(),
                            category,
                            subtype,
                            tags,
                          })
                          .eq("id", item.id)
                          .eq("revision", item.revision)
                          .is("deleted_at", null)
                          .select("id")
                          .single(),
                      );
                      if (!ready)
                        await photo({
                          action: "save",
                          itemId: item.id,
                          revision: item.revision,
                          category,
                          name: fields.name,
                        });
                      confirm(true);
                    }, "Saved to your wardrobe.");
                  }}
                >
                  <label>
                    Item name
                    <input
                      required
                      name="name"
                      maxLength={120}
                      defaultValue={item.name}
                    />
                  </label>
                  <div className="fields">
                    <label>
                      Category
                      <select
                        value={category}
                        required
                        onChange={(e) => {
                          group(e.target.value);
                          type("");
                        }}
                      >
                        <option value="">Select category</option>
                        {Object.keys(categories).map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Type
                      <select
                        value={subtype}
                        onChange={(e) => type(e.target.value)}
                      >
                        <option value="">Unspecified</option>
                        {(categories[category] || []).map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Availability
                    <select
                      name="availability"
                      defaultValue={item.availability}
                    >
                      {availability.map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <details>
                    <summary>More details</summary>
                    <div className="fields">
                      {(
                        [
                          "color",
                          "pattern",
                          "brand",
                          "material",
                          "size",
                          "fit",
                          "season",
                          "occasion",
                        ] as const
                      ).map((k) => (
                        <label key={k}>
                          {k[0].toUpperCase() + k.slice(1)}
                          <input
                            name={k}
                            maxLength={100}
                            defaultValue={item[k] || ""}
                          />
                        </label>
                      ))}
                    </div>
                    <label>
                      Tags, separated by commas
                      <input
                        name="tags"
                        maxLength={400}
                        defaultValue={item.tags?.join(", ")}
                      />
                    </label>
                  </details>
                  <button disabled={busy} className="primary">
                    {busy
                      ? "Saving…"
                      : ready
                        ? "Save changes"
                        : "Save to wardrobe"}
                  </button>
                </form>
              ) : (
                <div>
                  <h2>
                    {processing ? "Your original is uploaded" : "Photo draft"}
                  </h2>
                  <p>
                    {processing
                      ? "After background removal finishes, you can review the cutout, choose a category, and save to your wardrobe. This page updates automatically."
                      : item.error_code === "provider_unconfigured"
                        ? "Your original is saved. Background removal is unavailable right now. Choose Retry processing when the service is back."
                        : item.error_code
                          ? "Background removal needs attention. Retry processing or replace the photo."
                          : "Finish processing the photo before saving it to your wardrobe."}
                  </p>
                  {processing && (
                    <div className="actions">
                      <button className="primary" disabled>
                        Save to wardrobe
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void refresh()}
                      >
                        Check status
                      </button>
                    </div>
                  )}
                  {processing && (
                    <p>You can return to this photo under Needs review.</p>
                  )}
                  {["draft", "failed"].includes(item.status) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await invoke("retry");
                        }, "Processing requested.")
                      }
                    >
                      Retry processing
                    </button>
                  )}
                </div>
              )}
              {ready && (
                <div className="actions">
                  <button disabled={busy} onClick={() => styleItem(item.id)}>
                    Style this item
                  </button>
                  {saved && (
                    <button onClick={() => go("Add item")}>Add another</button>
                  )}
                </div>
              )}
              {ready && collections.length > 0 && (
                <fieldset disabled={busy}>
                  <legend>Collections</legend>
                  {collections.map((c) => (
                    <label className="check" key={c.id}>
                      <input
                        type="checkbox"
                        checked={members.includes(c.id)}
                        onChange={(e) => {
                          const add = e.target.checked;
                          void run(async () => {
                            if (add)
                              checked(
                                await db!.from("collection_items").insert({
                                  owner_id: item.owner_id,
                                  collection_id: c.id,
                                  item_id: item.id,
                                }),
                              );
                            else
                              checked(
                                await db!
                                  .from("collection_items")
                                  .delete()
                                  .eq("collection_id", c.id)
                                  .eq("item_id", item.id),
                              );
                            include(
                              add
                                ? [...members, c.id]
                                : members.filter((id) => id !== c.id),
                            );
                          }, "Collection updated.");
                        }}
                      />
                      {c.name}
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() => go("Add item/" + item.id)}
                >
                  Replace photo
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await invoke("trash");
                      go("Trash");
                    }, "Moved to Trash.")
                  }
                >
                  Move to Trash
                </button>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
