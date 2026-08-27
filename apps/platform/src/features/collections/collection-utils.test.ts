import assert from "node:assert/strict";
import test from "node:test";

import { filterCollectionRecords } from "./collection-utils.ts";

test("collection filtering is Vietnamese-insensitive and combines status with category", () => {
  const records = [
    { id: "1", title: "Luyện thi TSA", description: "Định lượng", status: "active" as const, category: "TSA", updatedAt: null, owner: "Tổ Toán", tags: ["2026"], metrics: [], metadata: {} },
    { id: "2", title: "Ôn luyện HSA", description: "Định tính", status: "draft" as const, category: "HSA", updatedAt: null, owner: "Tổ Văn", tags: [], metrics: [], metadata: {} },
  ];

  assert.deepEqual(
    filterCollectionRecords(records, { query: "dinh luong", status: "active", category: "TSA" }).map((record) => record.id),
    ["1"],
  );
  assert.deepEqual(filterCollectionRecords(records, { query: "", status: "all", category: "all" }), records);
});
