import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const privileged =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const local = !!(
  url &&
  ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) &&
  privileged &&
  key
);
test(
  "local Supabase prevents foreign slots and stale writes; permanent garment removal leaves a replaceable slot",
  { skip: !local },
  async () => {
    const clientOptions = {
      auth: { persistSession: false, autoRefreshToken: false },
    };
    const admin = createClient(url!, privileged!, clientOptions);
    const users: string[] = [];
    async function account() {
      const email = randomUUID() + "@example.test",
        password = randomUUID();
      const auth = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      assert.ifError(auth.error);
      const id = auth.data.user!.id;
      users.push(id);
      const db = createClient(url!, key!, clientOptions);
      assert.ifError(
        (await db.auth.signInWithPassword({ email, password })).error,
      );
      return { id, db };
    }
    try {
      const a = await account(),
        b = await account();
      const make = async (owner_id: string) => {
        const r = await admin
          .from("items")
          .insert({
            id: randomUUID(),
            name: "Local outfit fixture",
            owner_id,
            category: "Tops",
            cutout_path: "local-test.png",
            status: "ready",
          })
          .select("id")
          .single();
        assert.ifError(r.error);
        return r.data!.id;
      };
      const shirt = await make(a.id),
        foreign = await make(b.id),
        outfit = randomUUID();
      const args = {
        p_id: outfit,
        p_version: 0,
        p_name: "Friday",
        p_occasion: "Office",
        p_notes: "",
        p_favorite: false,
        p_status: "draft",
        p_slots: [{ slot: "Top", item_id: shirt, locked: true }],
      };
      let r = await a.db.rpc("save_outfit", args);
      assert.ifError(r.error);
      assert.equal(r.data, 1);
      assert.deepEqual(
        (await b.db.from("outfits").select("id").eq("id", outfit)).data,
        [],
      );
      assert.deepEqual(
        (await b.db.from("outfit_items").select("*").eq("outfit_id", outfit))
          .data,
        [],
      );
      assert.ok(
        (await b.db.rpc("save_outfit", { ...args, p_version: 1 })).error,
      );
      assert.ok(
        (
          await a.db.rpc("save_outfit", {
            ...args,
            p_version: 1,
            p_slots: [{ slot: "Top", item_id: foreign, locked: false }],
          })
        ).error,
      );
      assert.ok(
        (
          await a.db.rpc("save_outfit", {
            ...args,
            p_version: 1,
            p_slots: [{ slot: "Bottom", item_id: shirt, locked: false }],
          })
        ).error,
      );
      r = await a.db.rpc("save_outfit", {
        ...args,
        p_status: "saved",
        p_version: 1,
      });
      assert.ifError(r.error);
      assert.equal(r.data, 2);
      assert.ok(
        (await a.db.rpc("save_outfit", { ...args, p_version: 1 })).error,
      );
      const board = await a.db
        .from("outfits")
        .select("name,status,outfit_items(slot,item_id,locked)")
        .eq("id", outfit)
        .single();
      assert.ifError(board.error);
      assert.deepEqual(board.data, {
        name: "Friday",
        status: "saved",
        outfit_items: args.p_slots,
      });
      assert.ifError(
        (await admin.from("items").delete().eq("id", shirt)).error,
      );
      assert.deepEqual(
        (
          await a.db
            .from("outfit_items")
            .select("slot,item_id,locked")
            .eq("outfit_id", outfit)
        ).data,
        [{ slot: "Top", item_id: null, locked: true }],
      );
      const replace = await make(a.id);
      assert.ifError(
        (
          await a.db.rpc("save_outfit", {
            ...args,
            p_version: 2,
            p_slots: [{ slot: "Top", item_id: replace, locked: false }],
          })
        ).error,
      );
    } finally {
      for (const id of users)
        assert.ifError((await admin.auth.admin.deleteUser(id)).error);
    }
  },
);
