// Character and move data shapes, derived from the values in js/characters.js.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import type { Fighter } from "./fighter";
import type { Game } from "./game";
import type { PoseOverride } from "./pose";

export interface Stats {
  walk: number;
  dash: number;
  dashInit: number;
  dashFrames: number;
  run: number;
  traction: number;
  airSpeed: number;
  airAccel: number;
  airFriction: number;
  gravity: number;
  maxFall: number;
  fastFall: number;
  jump: number;
  shortHop: number;
  djump: number;
  jumpsquat: number;
  jumpMaxVX: number;
  airJumps: number;
  airdodge: number;
  float: number;
  weight: number;
}

export interface Colors {
  main: string;
  dark: string;
  accent: string;
  pants: string;
  skin: string;
  glow: string;
  shirt: string;
  stripe: string;
  sole: string;
}

// s/e: active frames (1-indexed). x/y: offset from the feet (x forward, y up). r: radius. d: damage.
// a: angle (0 forward, 90 up, 270 down). b: base knockback. k: knockback growth. g: hit group.
export interface Hitbox {
  s: number;
  e: number;
  x: number;
  y: number;
  r: number;
  d: number;
  a: number;
  b: number;
  k: number;
  g: number;
  grab: boolean;
  // Fixed knockback; 0 means scaled knockback.
  fkb: number;
  fx: string;
  // Rectangular hitbox of w by h (beams) instead of a circle of radius r.
  rect: boolean;
  w: number;
  h: number;
  noStale: boolean;
  noFlinch: boolean;
  unblockable: boolean;
  // Custom effect on contact; returning true stops checking further hitboxes this frame.
  onHit: HitCallback | null;
}

export type HitCallback = (attacker: Fighter, target: Fighter, g: Game) => boolean;

export interface HitboxOptions {
  g?: number;
  grab?: boolean;
  fkb?: number;
  fx?: string;
  rect?: boolean;
  w?: number;
  h?: number;
  noStale?: boolean;
  noFlinch?: boolean;
  unblockable?: boolean;
  onHit?: HitCallback;
}

// Hitbox helper matching js/characters.js H(s, e, x, y, r, d, a, b, k, extra).
export function H(s: number, e: number, x: number, y: number, r: number, d: number, a: number, b: number, k: number, o: HitboxOptions): Hitbox {
  return {
    s,
    e,
    x,
    y,
    r,
    d,
    a,
    b,
    k,
    g: o.g ?? 0,
    grab: o.grab ?? false,
    fkb: o.fkb ?? 0,
    fx: o.fx ?? "",
    rect: o.rect ?? false,
    w: o.w ?? 0,
    h: o.h ?? 0,
    noStale: o.noStale ?? false,
    noFlinch: o.noFlinch ?? false,
    unblockable: o.unblockable ?? false,
    onHit: o.onHit ?? null,
  };
}

export interface MovePoses {
  wind: PoseOverride;
  hit: PoseOverride;
}

export type MoveUpdate = (f: Fighter, sf: number, g: Game) => void;
export type MoveAnim = (f: Fighter, sf: number) => PoseOverride | null;
export type MoveDrawOver = (ctx: Draw2D, f: Fighter, g: Game) => void;

export interface Move {
  id: string;
  frames: number;
  iasa: number;
  hitboxes: Hitbox[];
  poses: MovePoses | null;
  aerial: boolean;
  special: boolean;
  smash: boolean;
  final: boolean;
  charge: number;
  landLag: number;
  landKeep: boolean;
  helplessAir: boolean;
  crouchMove: boolean;
  slideOff: boolean;
  // Intangible frame range [from, to], empty when none.
  intangible: number[];
  next: string;
  nextWin: number[];
  ledgeFrom: number;
  // Armor / super-armor windows: as..ae, 0 when none.
  as: number;
  ae: number;
  update: MoveUpdate | null;
  anim: MoveAnim | null;
  drawOver: MoveDrawOver | null;
}

export interface Throw {
  d: number;
  a: number;
  b: number;
  k: number;
}

export interface Throws {
  f: Throw;
  b: Throw;
  u: Throw;
  d: Throw;
}

export interface SelectStat {
  label: string;
  value: number;
}

export interface MoveListEntry {
  input: string;
  text: string;
}

export interface Character {
  id: string;
  name: string;
  title: string;
  colors: Colors;
  alt: Colors;
  selectStats: SelectStat[];
  moveList: MoveListEntry[];
  stats: Stats;
  throws: Throws;
  moves: Map<string, Move>;
}
