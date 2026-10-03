import { expect, test } from "bun:test";
import { CHAR_IDS } from "../src/characters";
import { checksum, createSnapshotter } from "../src/snapshot";
import { STAGES } from "../src/stages";
import { seedRandom } from "../src/util";
import { headless, MATCH, script } from "./harness";

const FRAMES = 3000;
const WINDOW = 40;

// Every 50 frames: save, play WINDOW frames, restore, replay them; any divergence means state the snapshot misses.
function firstDivergence(chars: string[], stage: string, seed: number): string {
  const { game, slots } = headless();
  seedRandom(seed);
  game.start({ ...MATCH, chars, stage, stocks: 4 });
  const snap = createSnapshotter(game);
  const inputs = script(seed, FRAMES + WINDOW);
  const step = (f: number): void => {
    slots[0] = inputs[f][0];
    slots[1] = inputs[f][1];
    game.step();
  };
  for (let f = 0; f < FRAMES; f++) {
    if (f % 50 === 0 && game.running) {
      const saved = snap.save();
      const first: number[] = [];
      for (let k = 0; k < WINDOW; k++) {
        step(f + k);
        first.push(checksum(game));
      }
      snap.restore(saved);
      for (let k = 0; k < WINDOW; k++) {
        step(f + k);
        if (checksum(game) !== first[k]) return `${chars.join("/")} on ${stage}: frame ${f + k}`;
      }
      snap.restore(saved);
    }
    step(f);
  }
  return "";
}

for (let i = 0; i < CHAR_IDS.length; i++) {
  for (let j = 0; j < CHAR_IDS.length; j++) {
    const chars = [CHAR_IDS[i], CHAR_IDS[j]];
    test(`snapshot round trip: ${chars.join(" vs ")}`, () => {
      for (const stage of STAGES) expect(firstDivergence(chars, stage.id, 11 + i * 7 + j)).toBe("");
    });
  }
}
