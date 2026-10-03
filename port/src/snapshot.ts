// Whole-game save and restore for rollback netplay. Web only: it walks objects generically, which the
// scriptc targets do not need. Immutable data (characters, moves, textures, the GPU, controllers) is shared
// by reference; every other object reachable from the Game is copied.
//
// Restore writes the saved values back into the same live objects instead of swapping in copies, because
// closures (projectile update/draw/onHit) capture fighters and other objects by identity.
import type { Game } from "./game";
import { rng } from "./util";

export interface Snapshot {
  // Each live object paired with its saved copy; the copies are never mutated, so a snapshot restores many times.
  live: object[];
  saved: object[];
  rng: number;
}

type Memo = Map<object, object>;

const SKIP = new Set(["gpu", "onEnd", "makeController", "W", "H", "paused", "debug"]);

export interface Snapshotter {
  save: () => Snapshot;
  restore: (snapshot: Snapshot) => void;
}

// Marks everything reachable from root as shared, so snapshots keep it by reference.
function share(root: unknown, shared: WeakSet<object>): void {
  if (root === null || typeof root !== "object") return;
  const object = root as object;
  if (shared.has(object)) return;
  shared.add(object);
  if (Array.isArray(object)) for (const item of object) share(item, shared);
  else if (object instanceof Map)
    for (const [k, v] of object) {
      share(k, shared);
      share(v, shared);
    }
  else if (object instanceof Set) for (const item of object) share(item, shared);
  else if (!ArrayBuffer.isView(object)) for (const v of Object.values(object as Record<string, unknown>)) share(v, shared);
}

// Call after game.start: shared roots are collected from the running match.
export function createSnapshotter(game: Game): Snapshotter {
  const shared = new WeakSet<object>();
  share(game.gpu, shared);
  shared.add(game.makeController);
  for (const f of game.fighters) {
    share(f.char, shared);
    shared.add(f.ctrl);
  }
  // Stage art holds baked textures; its platforms move and are copied.
  share(game.stage.art, shared);

  const save = (): Snapshot => {
    const memo: Memo = new Map();
    const live: object[] = [];
    const saved: object[] = [];
    const copy = (value: unknown): unknown => {
      if (value === null || typeof value !== "object") return value;
      const object = value as object;
      if (shared.has(object)) return object;
      const seen = memo.get(object);
      if (seen !== undefined) return seen;
      let out: object;
      if (Array.isArray(object)) {
        const array: unknown[] = [];
        memo.set(object, array);
        for (const item of object) array.push(copy(item));
        out = array;
      } else if (object instanceof Map) {
        const map = new Map<unknown, unknown>();
        memo.set(object, map);
        for (const [k, v] of object) map.set(copy(k), copy(v));
        out = map;
      } else if (object instanceof Set) {
        const set = new Set<unknown>();
        memo.set(object, set);
        for (const item of object) set.add(copy(item));
        out = set;
      } else if (ArrayBuffer.isView(object)) {
        out = (object as unknown as { slice: () => object }).slice();
        memo.set(object, out);
      } else {
        const record: Record<string, unknown> = {};
        memo.set(object, record);
        const source = object as Record<string, unknown>;
        const root = object === (game as object);
        for (const key of Object.keys(source)) if (!root || !SKIP.has(key)) record[key] = copy(source[key]);
        out = record;
      }
      live.push(object);
      saved.push(out);
      return out;
    };
    copy(game);
    return { live, saved, rng: rng.state };
  };

  const restore = (snapshot: Snapshot): void => {
    const back = new Map<object, object>();
    for (let i = 0; i < snapshot.saved.length; i++) back.set(snapshot.saved[i], snapshot.live[i]);
    const map = (value: unknown): unknown => {
      if (value === null || typeof value !== "object") return value;
      return back.get(value as object) ?? value;
    };
    for (let i = 0; i < snapshot.live.length; i++) {
      const target = snapshot.live[i];
      const from = snapshot.saved[i];
      if (Array.isArray(target)) {
        const source = from as unknown[];
        target.length = source.length;
        for (let k = 0; k < source.length; k++) target[k] = map(source[k]);
      } else if (target instanceof Map) {
        target.clear();
        for (const [k, v] of from as Map<unknown, unknown>) target.set(map(k), map(v));
      } else if (target instanceof Set) {
        target.clear();
        for (const item of from as Set<unknown>) target.add(map(item));
      } else if (ArrayBuffer.isView(target)) {
        (target as unknown as { set: (source: unknown) => void }).set(from);
      } else {
        const record = target as Record<string, unknown>;
        const source = from as Record<string, unknown>;
        const root = target === (game as object);
        for (const key of Object.keys(record)) if (!(key in source) && !(root && SKIP.has(key))) delete record[key];
        for (const key of Object.keys(source)) record[key] = map(source[key]);
      }
    }
    rng.state = snapshot.rng;
  };

  return { save, restore };
}

// Cheap state fingerprint for desync detection.
export function checksum(game: Game): number {
  let h = 2166136261;
  const mix = (v: number): void => {
    h = Math.imul(h ^ Math.round(v * 100), 16777619);
  };
  mix(game.frame);
  mix(rng.state);
  for (const f of game.fighters) {
    mix(f.x);
    mix(f.y);
    mix(f.vx);
    mix(f.vy);
    mix(f.percent);
    mix(f.stocks);
  }
  mix(game.projs.length);
  return h >>> 0;
}
