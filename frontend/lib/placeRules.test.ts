import { test } from "node:test";
import assert from "node:assert/strict";
import { fold, labelRank } from "./placeRules.ts";

test("common Kerala spelling variants fold together", () => {
  for (const [a, b] of [["Vyttila", "Vytilla"], ["Thrissur", "Trissur"], ["Edappally", "Edapally"], ["Kozhikode", "Kolikode"],
    ["Kalamassery", "Kalamasseri"], ["Thampanoor", "Tampanur"], ["Wayanad", "Vayanad"], ["Āluva", "Aluva"]])
    assert.equal(fold(a), fold(b), `${a} / ${b}`);
  assert.notEqual(fold("Kochi"), fold("Kollam"));
});

test("more places are labelled as you zoom in", () => {
  assert.equal(labelRank(8), 1);
  assert.ok(labelRank(10) < labelRank(13));
  assert.equal(labelRank(15), 6);
});
