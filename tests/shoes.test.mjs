import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { load, html } from "./app.mjs";

const SHOES = new Function("t", "return " + html.match(/var SHOES = (\[[\s\S]*?\n  \]);/)[1])((x) => x);
const base = { use: "daily", sex: "m", width: "normal", arch: "unsure", budget: 6500, brands: [] };
function finder(shoes = SHOES, extra = {}) {
  return load(["pickShoes", "cleanShoeQ", "toggleShoeBrand"], { SHOES: shoes, ...extra }, ["SHOE_USE", "SHOE_BRANDS"]);
}
const variant = (p, suffix) => ({ p, url: "https://www.asics.com/th/" + suffix });
const model = (brand, name, m, f, rest = {}) => ({ b: brand, n: name, c: ["daily"], cu: 2, r: 0, v: { m, f }, ...rest });

for (const entry of [
  { brand: "HOKA", name: "Mach 7", sex: "f", use: "speed", price: 5990,
    wide: "https://hoka.co.th/products/1171906-ost-hoka-mach-7-wide-women",
    regular: "https://hoka.co.th/products/1171938-ckcs-hoka-mach-7-women" },
  { brand: "New Balance", name: "1080 v15", sex: "m", use: "cushion", price: 6000,
    wide: "https://www.newbalance.co.th/new-balance-1080-v15-men-performance-running-white.html",
    regular: "https://www.newbalance.co.th/new-balance-1080-v15-men-performance-running-grey.html" }
]) test(`verified ${entry.brand} ${entry.name} ${entry.sex} Wide fixes the empty search within budget`, () => {
  const a = finder();
  const q = { ...base, brands: [entry.brand], sex: entry.sex, use: entry.use, width: "wide", arch: "normal", budget: entry.price };
  const match = a.pickShoes(q).picks.find((x) => x.s.n === entry.name)?.s;
  assert.ok(match, "previously empty gender/brand/use/Wide search must return the verified model");
  assert.equal(match.url, entry.wide);
  assert.equal(match.p, entry.price);
  assert.equal(match.w, 1);
  assert.equal(a.pickShoes({ ...q, budget: entry.price - 1 }).count, 0, "never exceed the budget");
  assert.equal(a.pickShoes({ ...q, width: "normal" }).picks.find((x) => x.s.n === entry.name)?.s.url, entry.regular);
  for (const changed of [{ sex: entry.sex === "m" ? "f" : "m" }, { arch: "flat" }, { use: "race" }, { brands: ["Nike"] }]) {
    assert.ok(a.pickShoes({ ...q, ...changed }).picks.every((x) => x.s.url !== entry.wide), "other filters must not admit this variant");
  }
});

test("multiple brands form a union and never admit an unselected brand", () => {
  const a = finder([model("ASICS", "A", variant(4500, "a")), model("Nike", "B", variant(4600, "b")), model("HOKA", "C", variant(4400, "c"))]);
  const result = a.pickShoes({ ...base, brands: ["ASICS", "Nike"] });
  assert.deepEqual(Array.from(result.picks, (x) => x.s.b).sort(), ["ASICS", "Nike"]);
  assert.equal(a.pickShoes(base).count, 3, "no selected brands means all brands");
});

test("gender-specific prices and product links are used before the budget check", () => {
  const a = finder([model("ASICS", "Different prices", variant(4100, "men"), variant(4700, "women")), model("Nike", "Men only", variant(4200, "men-only"))]);
  assert.equal(a.pickShoes({ ...base, sex: "f", budget: 4699 }).count, 0);
  const female = a.pickShoes({ ...base, sex: "f", budget: 4700 }).picks[0].s;
  assert.equal(female.p, 4700);
  assert.ok(female.url.endsWith("women"));
  assert.equal(a.pickShoes({ ...base, sex: "m", budget: 4100 }).picks[0].s.p, 4100);
});

test("Wide uses its own price/link and excludes unverified Wide and Wide-only normal results", () => {
  const regular = { ...variant(4000, "normal"), w: variant(5200, "wide") };
  const a = finder([model("ASICS", "Both widths", regular), model("Nike", "Regular only", variant(3000, "regular")), model("HOKA", "Wide only", { ...variant(5100, "wide-only"), onlyWide: 1 })]);
  assert.equal(a.pickShoes({ ...base, width: "wide", budget: 5000 }).count, 0);
  const result = a.pickShoes({ ...base, width: "wide", budget: 5200 });
  assert.equal(result.count, 2);
  assert.ok(result.picks.every((x) => x.s.w && x.s.url.includes("wide")));
  assert.ok(a.pickShoes(base).picks.every((x) => x.s.n !== "Wide only"));
});

test("Narrow never silently substitutes a regular or Wide shoe when no Narrow SKU is verified", () => {
  const a = finder();
  const result = a.pickShoes({ ...base, width: "narrow", budget: 30000 });
  assert.equal(result.count, 0);
  assert.equal(result.picks.length, 0);
  assert.equal(result.nearest, null);
});

test("use, flat-arch support, brand, gender and budget remain combined hard constraints", () => {
  const a = finder([model("ASICS", "Fit", variant(5000, "fit"), variant(5500, "fit-f"), { st: 1 }), model("Nike", "Neutral", variant(4000, "neutral")), model("ASICS", "Trail", variant(4000, "trail"), null, { st: 1, c: ["trail"] })]);
  const q = { ...base, arch: "flat", brands: ["ASICS", "Nike"] };
  assert.deepEqual(Array.from(a.pickShoes(q).picks, (x) => x.s.n), ["Fit"]);
  assert.equal(a.pickShoes({ ...q, budget: 4999 }).count, 0);
  assert.equal(a.pickShoes({ ...q, use: "race" }).count, 0);
});

test("empty results show no product or over-budget alternative and provide an explicit reset", () => {
  const a = finder(SHOES, { S: { shoeQ: { ...base, budget: 500 }, runs: [] }, latestWeight: () => 0, esc: (x) => String(x) });
  // Load the actual output function with the same pure selection implementation.
  const view = load(["pickShoes", "finderHtml", "baht"], { ...a, SHOE_DATE: "2026-10-15" }, ["SHOE_USE"]);
  const result = view.finderHtml();
  assert.match(result, /ไม่พบรุ่นตรงเงื่อนไข/);
  assert.match(result, /id="sf-reset"/);
  assert.doesNotMatch(result, /class="shoe[ "]/);
  assert.equal(a.pickShoes({ ...base, budget: 500 }).nearest, null);
});

test("brand cleaner defaults old backups to all, removes invalid values and preserves multiple choices", () => {
  const a = finder();
  assert.deepEqual(Array.from(a.cleanShoeQ({ ...base, brands: undefined }).brands), []);
  const clean = a.cleanShoeQ({ ...base, brands: ["Nike", "Nike", "ASICS", "invented", null] });
  assert.deepEqual(Array.from(clean.brands), ["ASICS", "Nike"]);
  assert.equal(clean.budget, 6500);
  assert.deepEqual(Array.from(a.cleanShoeQ({ ...base, brands: "Nike" }).brands), []);
});

test("brand toggles retain other filters and all/reset is explicit", () => {
  const a = finder();
  const one = a.toggleShoeBrand({ ...base, sex: "f", budget: 5100 }, "Nike");
  const two = a.toggleShoeBrand(one, "HOKA");
  assert.deepEqual(Array.from(two.brands), ["Nike", "HOKA"]);
  assert.equal(two.sex, "f"); assert.equal(two.budget, 5100);
  assert.deepEqual(Array.from(a.toggleShoeBrand(two, "Nike").brands), ["HOKA"]);
  assert.equal(a.toggleShoeBrand(two, "all").brands.length, 0);
  assert.equal(a.toggleShoeBrand(two, "unknown").brands.length, 2);
});

test("the real catalog has distinct models and documented Thai product URLs for each variant", () => {
  const sources = readFileSync(new URL("../docs/shoes-sources.md", import.meta.url), "utf8");
  const seen = new Set();
  const domains = new Set(["www.asics.com", "www.nike.com", "www.adidas.co.th", "www.newbalance.co.th", "hoka.co.th", "brooks.rev.co.th", "th.puma.com", "www.on.com", "tha.mizuno.com"]);
  assert.equal(SHOES.length, 60);
  assert.equal(new Set(SHOES.map((sh) => sh.b)).size, 10);
  for (const sh of SHOES) {
    const key = sh.b + " " + sh.n; assert.ok(!seen.has(key), key); seen.add(key);
    assert.equal(sh.r, 0, "unverified review ratings must not be invented");
    for (const v of Object.values(sh.v)) for (const item of [v, v.w].filter(Boolean)) {
      const url = new URL(item.url); assert.equal(url.protocol, "https:");
      assert.ok(domains.has(url.hostname), item.url);
      assert.ok(item.p > 0 && Number.isInteger(item.p));
      assert.ok(sources.includes(item.url), "source audit missing " + item.url);
    }
  }
});

test("all six original SVG categories use theme classes without external images", () => {
  const a = load(["shoeIllustration"], { esc: (x) => String(x) });
  const drawings = ["daily", "cushion", "speed", "race", "trail", "stability"].map((kind) => a.shoeIllustration({ b: "ASICS", c: [kind], st: kind === "stability" }));
  assert.equal(new Set(drawings).size, 6);
  for (const svg of drawings) { assert.match(svg, /aria-hidden="true"/); assert.doesNotMatch(svg, /https?:|<image|#[0-9a-f]{3,8}["']/i); }
});

test("official product links open safely with no search-page or image hotlink", () => {
  const a = load(["shoeCard", "shoeIllustration", "baht"], { esc: (x) => String(x).replaceAll('"', "&quot;") });
  const card = a.shoeCard({ s: { ...SHOES[0], url: SHOES[0].v.f.url }, why: [], warn: [] }, { ...base, sex: "f" }, 0);
  assert.match(card, /target="_blank" rel="noopener noreferrer"/);
  assert.ok(card.includes(SHOES[0].v.f.url));
  assert.doesNotMatch(card, /google.com|<img|<image/);
});
