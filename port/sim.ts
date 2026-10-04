// The dotframe CLI contract (dotframe sim, snap, replay, desync) for a Crafter Smash match.
import type { Gpu } from "../vendor/dotframe/src/gpu";
import { defineSim, type SimPlatform, type SimRun } from "../vendor/dotframe/src/sim";
import { loadMatchAssets, windowOptions } from "./match/game";
import { Game, type GameConfig } from "./src/game";
import type { Controller, RawInput } from "./src/input";
import { decodeInput, encodeInput, NEUTRAL_INPUT } from "./src/netinput";
import { checksum, createSnapshotter, type Snapshot } from "./src/snapshot";
import { seedRandom } from "./src/util";

const MATCH: GameConfig = { stage: "station", chars: ["railly", "anthony"], mode: "vs", stocks: 3, cpu: [false, false], cpuLevel: 5 };

export default defineSim({
  players: 2,
  window: windowOptions,
  options: MATCH as unknown as Record<string, unknown>,
  neutral: NEUTRAL_INPUT,
  encode: (input: unknown): number => encodeInput({ x: 0, y: 0, cx: 0, cy: 0, attack: false, special: false, shield: false, grab: false, jump: false, taunt: false, ...(input as Partial<RawInput>) }),
  random: (next: () => number): number =>
    encodeInput({ x: next() * 2 - 1, y: next() * 2 - 1, cx: 0, cy: 0, attack: next() < 0.3, special: next() < 0.15, shield: next() < 0.08, grab: next() < 0.05, jump: next() < 0.2, taunt: false }),
  create: (platform: SimPlatform): SimRun => {
    const slots = [NEUTRAL_INPUT, NEUTRAL_INPUT];
    const controller = (port: number): Controller => ({ isCPU: false, read: (): RawInput => decodeInput(slots[port]) });
    const game = new Game(platform.gpu, windowOptions.width, windowOptions.height, controller);
    const snap = createSnapshotter(game);
    const ready =
      platform.headless || !platform.draw
        ? Promise.resolve()
        : loadMatchAssets({ gpu: platform.gpu as Gpu, draw: platform.draw, audio: platform.audio ?? null, load: platform.load, root: ".", dotframe: "vendor/dotframe" });
    return {
      ready,
      start: (seed: number, options: Record<string, unknown>): void => {
        seedRandom(seed);
        const cfg = { ...MATCH, ...options } as GameConfig;
        game.start(cfg);
      },
      step: (inputs: number[]): void => {
        slots[0] = inputs[0];
        slots[1] = inputs[1];
        game.step();
      },
      checksum: (): number => checksum(game),
      state: () => ({
        frame: game.frame,
        phase: game.phase,
        winner: game.winner ? game.winner.charId : null,
        fighters: game.fighters.map((f) => ({ id: f.charId, x: Math.round(f.x), y: Math.round(f.y), percent: Math.round(f.percent), stocks: f.stocks, state: f.state })),
      }),
      over: (): boolean => !game.running,
      save: (): unknown => snap.save(),
      restore: (s: unknown): void => snap.restore(s as Snapshot),
      inspect: (): unknown => game,
      render: (draw) => game.render(draw),
    };
  },
});
