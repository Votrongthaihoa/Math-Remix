import assert from "node:assert/strict";
import test from "node:test";

import { upsertCollectionRecord } from "./collection-state.ts";

test("collection state inserts a new record and replaces an edited record without duplicates", () => {
  const base = [{ id: "1", title: "Bản ghi cũ" }];
  const inserted = upsertCollectionRecord(base, { id: "2", title: "Bản ghi mới" });
  const edited = upsertCollectionRecord(inserted, { id: "1", title: "Bản ghi đã sửa" });

  assert.deepEqual(edited, [
    { id: "1", title: "Bản ghi đã sửa" },
    { id: "2", title: "Bản ghi mới" },
  ]);
});
