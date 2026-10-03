// Headless game for netplay tests: a stub GPU and controllers fed from a per-port input slot.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import type { RenderGpu, Texture } from "../../vendor/dotframe/src/gpu";
import { Game, type GameConfig } from "../src/game";
import type { Controller, RawInput } from "../src/input";
import { decodeInput, encodeInput } from "../src/netinput";

let nextTexture = 1;
export const stubGpu: RenderGpu = {
  createBuffer: (): number => 0,
  writeBuffer: (): void => {},
  destroyBuffer: (): void => {},
  createPipeline: (): number => 0,
  bind: (): number => 0,
  createTexture: (width: number, height: number): Texture => ({ id: nextTexture++, width, height }) as Texture,
  frame: (): void => {},
  aspect: (): number => 16 / 9,
};

export interface Headless {
  game: Game;
  // Encoded input each port reads on the next step.
  slots: number[];
}

export function headless(): Headless {
  const slots = [0, 0];
  const controller = (port: number): Controller => ({ isCPU: false, read: (): RawInput => decodeInput(slots[port]) });
  const game = new Game(stubGpu, 1280, 720, (port: number): Controller => controller(port));
  return { game, slots };
}

export const MATCH: GameConfig = { stage: "station", chars: ["railly", "anthony"], mode: "vs", stocks: 3, cpu: [false, false], cpuLevel: 5 };

// Scripted pseudo-random inputs that change every few frames, like a mashing player.
export function script(seed: number, frames: number): number[][] {
  let s = seed;
  const next = (): number => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    return s / 4294967296;
  };
  const out: number[][] = [];
  let cur = [0, 0];
  for (let f = 0; f < frames; f++) {
    if (f % 6 === 0) {
      cur = [0, 1].map((): number =>
        encodeInput({ x: next() * 2 - 1, y: next() * 2 - 1, cx: 0, cy: 0, attack: next() < 0.3, special: next() < 0.15, shield: next() < 0.08, grab: next() < 0.05, jump: next() < 0.2, taunt: false }),
      );
    }
    out.push(cur.slice());
  }
  return out;
}

// A Draw2D that accepts every call and draws nothing, so render paths run headless.
export const stubDraw: Draw2D = new Proxy({} as Draw2D, {
  get: (_target: Draw2D, key: string | symbol): unknown => {
    if (key === "measureText") return (): { width: number } => ({ width: 10 });
    if (key === "getGlobalAlpha") return (): number => 1;
    return (): void => {};
  },
});
