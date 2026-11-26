import { useState, useEffect } from "react";
import Image from "next/image";
import { FolderOpen } from "lucide-react";
import { db, checked, message } from "../lib/client";
export default function Groups({
  userId,
  go,
}: {
  userId: string;
  go: (v: string) => void;
}) {
  const [rows, set] = useState<
      { id: string; name: string; collection_items: { count: number }[] }[]
    >([]),
    [name, input] = useState(""),
    [note, tell] = useState("");
  async function load() {
    try {
      set(
        checked(
          await db!
            .from("collections")
            .select("id,name,collection_items(count)")
            .eq("owner_id", userId)
            .order("name"),
        ) || [],
      );
    } catch (e) {
      tell(message(e));
    }
  }
  useEffect(() => {
    void load();
  }, [userId]);
  return (
    <>
      <header className="collection-banner">
        <div>
          <h1>Collections</h1>
          <p className="intro">
            Group your pieces for occasions, seasons and trips.
          </p>
        </div>
        <Image
          src="/fabric-c-collection.webp"
          alt=""
          width={320}
          height={320}
          unoptimized
        />
      </header>
      <form
        className="inline-form"
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            checked(
              await db!
                .from("collections")
                .insert({ name: name.trim(), owner_id: userId }),
            );
            input("");
            await load();
            tell("Collection created.");
          } catch (e) {
            tell(message(e));
          }
        }}
      >
        <label>
          Collection name
          <input
            required
            maxLength={100}
            value={name}
            placeholder="e.g. Weekend away"
            onChange={(e) => input(e.target.value)}
          />
        </label>
        <button className="primary" disabled={!name.trim()}>
          Create collection
        </button>
      </form>
      <p role="status">{note}</p>
      {rows.length ? (
        <div className="groups">
          {rows.map((r) => (
            <button key={r.id} onClick={() => go("Collection/" + r.id)}>
              <FolderOpen />
              <strong>{r.name}</strong>
              <small>{r.collection_items[0]?.count || 0} pieces</small>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty">
          <FolderOpen />
          <h2>No collections yet</h2>
          <p>Create a collection, then add pieces from their item details.</p>
        </div>
      )}
    </>
  );
}
