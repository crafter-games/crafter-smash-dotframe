import { expect, test } from "bun:test";
import { CHAR_IDS } from "../src/characters";
import { rng, seedRandom } from "../src/util";
import { headless, MATCH, script, stubDraw } from "./harness";

// Rendering must not change simulation state: netplay peers draw at different refresh rates.
function firstDifference(a: unknown, b: unknown, path: string, seen: Set<unknown>): string {
  if (typeof a === "function" || typeof b === "function") return "";
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return a === b || (Number.isNaN(a) && Number.isNaN(b)) ? "" : `${path}: ${String(a)} vs ${String(b)}`;
  }
  if (seen.has(a)) return "";
  // Baked stage textures get different ids per game; they are not simulation state.
  if (path.endsWith(".art") || path.endsWith(".gpu")) return "";
  seen.add(a);
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return `${path}: map size`;
    return "";
  }
  if (a instanceof Set && b instanceof Set) return a.size === b.size ? "" : `${path}: set size`;
  const keys = Object.keys(a as object);
  for (const key of keys) {
    const d = firstDifference((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`, seen);
    if (d !== "") return d;
  }
  return "";
}

for (const id of CHAR_IDS) {
  test(`drawing does not change the simulation: ${id}`, () => {
    const plain = headless();
    const drawn = headless();
    for (const h of [plain, drawn]) {
      seedRandom(21);
      h.game.start({ ...MATCH, chars: [id, CHAR_IDS[(CHAR_IDS.indexOf(id) + 1) % CHAR_IDS.length]], stocks: 9 });
    }
    const inputs = script(33, 3000);
    // One module-level generator serves both games, so each keeps its own state between steps.
    const rngs = [21, 21];
    let diff = "";
    for (let f = 0; f < 3000 && diff === ""; f++) {
      [plain, drawn].forEach((h, i) => {
        h.slots[0] = inputs[f][0];
        h.slots[1] = inputs[f][1];
        if (f % 300 === 0) for (const fighter of h.game.fighters) fighter.meter = 100;
        rng.state = rngs[i];
        h.game.step();
        if (i === 1) for (let r = 0; r < 3; r++) h.game.render(stubDraw);
        rngs[i] = rng.state;
      });
      // Every 10 frames: render-spawned effects (texts, particles) live at least 16 frames.
      if (f % 10 === 0) diff = `${firstDifference(plain.game, drawn.game, "game", new Set())}`;
      if (diff !== "") diff = `frame ${f}: ${diff}`;
    }
    expect(diff).toBe("");
  });
}
