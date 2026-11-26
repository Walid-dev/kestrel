// The list engine on a made-up kind: filters combine, each pill counts under the other filters, number steps come
// from the values, sorts put an unknown or unsure value last whichever way they run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { filterRows, formatMoney, type ListKind, numberSteps, pillCounts, type Row, sortRows } from "./kinds.ts";

const KIND: ListKind = {
  key: "made-up",
  name: "Made-up kettles",
  fields: [
    { key: "name", label: "Name", type: "text" },
    { key: "price", label: "Price", type: "money", better: "lower" },
    { key: "litres", label: "Litres", type: "number", unit: "L", better: "higher" },
    { key: "stores", label: "Sold at", type: "list" },
    { key: "quiet", label: "Quiet", type: "bool" },
  ],
  filters: [
    { key: "store", label: "Sold at", field: "stores", how: "is" },
    { key: "litres", label: "Litres", field: "litres", how: "atLeast" },
    { key: "price", label: "Price", field: "price", how: "atMost" },
    { key: "quiet", label: "Quiet", field: "quiet", how: "flag" },
  ],
  sorts: [
    { key: "price", label: "Price", field: "price" },
    { key: "litres", label: "Litres", field: "litres" },
    { key: "name", label: "Name", field: "name" },
  ],
  title: "name",
  currency: "CAD",
};
const row = (
  id: string,
  price: number | null,
  litres: number | null,
  stores: string[],
  quiet: boolean,
  unsure: string[] = [],
): Row => ({
  id,
  values: { name: id, price, litres, stores, quiet },
  unsure,
});
const ROWS = [
  row("Alba", 4999, 1.7, ["Store A", "Store B"], true),
  row("Brio", 2999, 1.0, ["Store B"], false),
  row("Cova", null, 1.5, [], true),
  row("Dune", 8999, 2.0, ["Store A"], false, ["litres"]),
  row("Esk", 6999, 1.2, ["Store C"], true),
];
const ids = (rows: Row[]) => rows.map((r) => r.id);

test("filters combine; an unknown or unsure value never passes a threshold", () => {
  assert.deepEqual(ids(filterRows(KIND, ROWS, { store: "Store A" })), ["Alba", "Dune"]);
  assert.deepEqual(ids(filterRows(KIND, ROWS, { store: "Store A", quiet: "yes" })), ["Alba"]);
  // Dune's litres are unsure: shown with a "?", never filtered on
  assert.deepEqual(ids(filterRows(KIND, ROWS, { litres: "1.5" })), ["Alba", "Cova"]);
  // Cova has no price: "at most" never lets an unknown through
  assert.deepEqual(ids(filterRows(KIND, ROWS, { price: "5000" })), ["Alba", "Brio"]);
  assert.deepEqual(ids(filterRows(KIND, ROWS, { store: null, quiet: "" })), ids(ROWS));
});

test("each pill counts the rows it would show under the other filters picked, All first", () => {
  const pills = pillCounts(KIND, ROWS, { quiet: "yes" }, "store");
  assert.deepEqual(
    pills.map((p) => [p.label, p.count]),
    [
      ["All", 3],
      ["Store A", 1],
      ["Store B", 1],
      ["Store C", 1],
    ],
  );
  // a flag's one pill, counted under the store picked
  assert.deepEqual(
    pillCounts(KIND, ROWS, { store: "Store B" }, "quiet").map((p) => [p.label, p.count]),
    [
      ["All", 2],
      ["Quiet", 1],
    ],
  );
  // number steps as pills, "at most" for a price, in its currency
  const price = pillCounts(KIND, ROWS, {}, "price");
  assert.equal(price[0].label, "All");
  assert.ok(
    price.slice(1).every((p) => p.label.startsWith("≤ $")),
    JSON.stringify(price),
  );
});

test("number steps: two or three, inside the values, none for under three values", () => {
  assert.deepEqual(numberSteps([90, 120, 150, 180, 200]), [120, 150, 180]);
  // lower is better: "at most" steps, rounded up, the loosest first
  assert.deepEqual(numberSteps([61.5, 64, 66.2, 70], "lower"), [67, 64]);
  assert.deepEqual(numberSteps([5, 5, 7]), []);
  assert.deepEqual(numberSteps([2999, 4999, 6999, 8999], "lower"), [7000, 5000]);
});

test("sorts follow the field's better way; unknown and unsure values go last whichever way", () => {
  assert.deepEqual(ids(sortRows(KIND, ROWS, "price")), ["Brio", "Alba", "Esk", "Dune", "Cova"]);
  assert.deepEqual(ids(sortRows(KIND, ROWS, "price", "desc")), ["Dune", "Esk", "Alba", "Brio", "Cova"]);
  assert.deepEqual(ids(sortRows(KIND, ROWS, "litres")), ["Alba", "Cova", "Esk", "Brio", "Dune"]);
  assert.deepEqual(ids(sortRows(KIND, ROWS, "name")), ["Alba", "Brio", "Cova", "Dune", "Esk"]);
});

test("money reads as a price: whole dollars without cents", () => {
  assert.equal(formatMoney(44900), "$449");
  assert.equal(formatMoney(129999), "$1,299.99");
});
