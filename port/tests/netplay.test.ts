import { expect, test } from "bun:test";
import type { NetMessage, Transport } from "../src/net-types";
import { createRollback } from "../src/netplay";
import { NEUTRAL_INPUT } from "../src/netinput";
import { checksum } from "../src/snapshot";
import { seedRandom } from "../src/util";
import { headless, MATCH, script, stubDraw } from "./harness";

const FRAMES = 1800;
const DELAY = 2;

// A pair of in-memory transports; each message arrives after `latency` ticks plus up to `jitter` more, in order.
function link(latency: number, jitter: number, seed: number): { a: Transport; b: Transport; advance: () => void } {
  let s = seed;
  const noise = (): number => {
    s = (Math.imul(s, 48271) + 1) >>> 0;
    return s % (jitter + 1);
  };
  let now = 0;
  const queues: { at: number; message: NetMessage }[][] = [[], []];
  const endpoint = (self: number): Transport => ({
    send: (message: NetMessage): void => {
      const q = queues[1 - self];
      const last = q.length > 0 ? q[q.length - 1].at : 0;
      q.push({ at: Math.max(last, now + latency + noise()), message: JSON.parse(JSON.stringify(message)) as NetMessage });
    },
    receive: (): NetMessage[] => {
      const q = queues[self];
      const out: NetMessage[] = [];
      while (q.length > 0 && q[0].at <= now) out.push((q.shift() as { message: NetMessage }).message);
      return out;
    },
  });
  return { a: endpoint(0), b: endpoint(1), advance: (): void => { now += 1; } };
}

// The state both peers must reach: every frame simulated once with both real inputs (delayed like netplay does).
function reference(chars: string[], seed: number, inputs: number[][]): number {
  const { game, slots } = headless();
  seedRandom(seed);
  game.start({ ...MATCH, chars });
  for (let f = 0; f < FRAMES; f++) {
    slots[0] = f < DELAY ? NEUTRAL_INPUT : inputs[f - DELAY][0];
    slots[1] = f < DELAY ? NEUTRAL_INPUT : inputs[f - DELAY][1];
    game.step();
  }
  return checksum(game);
}

function netplay(chars: string[], seed: number, inputs: number[][], latency: number, jitter: number): { sums: number[]; rollbacks: number; longest: number; desync: number } {
  const net = link(latency, jitter, seed);
  const peers = [0, 1].map((port: number) => {
    const h = headless();
    seedRandom(seed);
    h.game.start({ ...MATCH, chars });
    return { h, rb: createRollback({ game: h.game, transport: port === 0 ? net.a : net.b, localPort: port, slots: h.slots, inputDelay: DELAY, maxRollback: 10 }) };
  });
  // Each peer owns the module RNG while it simulates, as two separate clients would.
  const rngs = [seed, seed];
  const run = (i: number, fn: () => void): void => {
    seedRandomState(rngs[i]);
    fn();
    rngs[i] = readRandomState();
  };
  for (let tick = 0; tick < FRAMES * 3; tick++) {
    for (let i = 0; i < 2; i++) {
      const p = peers[i];
      run(i, (): void => {
        const f = p.rb.stats().frame;
        if (f < FRAMES) p.rb.tick(inputs[f][i]);
        else p.rb.settle();
        // Peers render at their own pace (different refresh rates); drawing must not touch simulation state.
        for (let r = 0; r < 1 + ((tick * (i + 2)) % 3); r++) p.h.game.render(stubDraw);
      });
    }
    net.advance();
    if (peers.every((p) => p.rb.confirmedFrame() >= FRAMES)) break;
  }
  return {
    sums: peers.map((p, i): number => {
      let sum = 0;
      run(i, (): void => {
        sum = checksum(p.h.game);
      });
      return sum;
    }),
    rollbacks: peers[0].rb.stats().rollbacks + peers[1].rb.stats().rollbacks,
    longest: Math.max(peers[0].rb.stats().longestRollback, peers[1].rb.stats().longestRollback),
    desync: Math.max(peers[0].rb.stats().desync, peers[1].rb.stats().desync),
  };
}

import { rng } from "../src/util";
const seedRandomState = (state: number): void => {
  rng.state = state;
};
const readRandomState = (): number => rng.state;

const CASES = [
  { chars: ["railly", "anthony"], latency: 0, jitter: 0 },
  { chars: ["jibaru", "shiara"], latency: 3, jitter: 2 },
  { chars: ["edward", "jibaru"], latency: 6, jitter: 4 },
  { chars: ["shiara", "railly"], latency: 9, jitter: 3 },
];

for (const c of CASES) {
  test(`${c.chars.join(" vs ")} at ${c.latency}+${c.jitter} frames of latency matches the offline match`, () => {
    const seed = 17;
    const inputs = script(seed, FRAMES);
    const expected = reference(c.chars, seed, inputs);
    const result = netplay(c.chars, seed, inputs, c.latency, c.jitter);
    expect(result.desync).toBe(-1);
    expect(result.sums[0]).toBe(expected);
    expect(result.sums[1]).toBe(expected);
    if (c.latency > DELAY) expect(result.rollbacks).toBeGreaterThan(0);
  });
}
