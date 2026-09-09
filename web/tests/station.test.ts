import { describe, expect, it } from "vitest";

import {
  filterStationSuggestions,
  uniquePreserveOrder,
} from "@/lib/station";

describe("uniquePreserveOrder", () => {
  it("keeps the first of duplicated station names", () => {
    expect(uniquePreserveOrder(["東京", "赤坂", "東京", "赤坂", "横浜"])).toEqual([
      "東京",
      "赤坂",
      "横浜",
    ]);
  });

  it("returns an empty list unchanged", () => {
    expect(uniquePreserveOrder([])).toEqual([]);
  });
});

describe("filterStationSuggestions", () => {
  const names = ["横浜", "横浜駅", "赤坂", "東京", "みなとみらい", "三ノ宮"];

  it("returns nothing until the user has typed something", () => {
    expect(filterStationSuggestions(names, "")).toEqual([]);
    expect(filterStationSuggestions(names, "   ")).toEqual([]);
  });

  it("prefers prefix matches and strips a trailing 駅", () => {
    expect(filterStationSuggestions(["横浜", "横川", "品川"], "横浜駅")).toEqual([
      "横浜",
    ]);
  });

  it("deduplicates names that appear on more than one sheet", () => {
    const suggestions = filterStationSuggestions(
      ["赤坂", "赤坂", "赤羽"],
      "赤",
    );
    expect(suggestions.filter((name) => name === "赤坂")).toHaveLength(1);
    expect(suggestions).toContain("赤坂");
  });

  it("caps the list so a phone keyboard is not buried", () => {
    const many = Array.from({ length: 40 }, (_, index) => `東京${index}`);
    expect(filterStationSuggestions(many, "東京", 8)).toHaveLength(8);
  });
});
