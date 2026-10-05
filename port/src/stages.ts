// Pixel-art stages in the style of Super Smash Flash, ported from js/stages.js.
// Bakes run once on the CPU with Raster2D and upload as textures; drawing goes through draw2d.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import type { RenderGpu, Texture } from "../../vendor/dotframe/src/gpu";
import {
  addColorStop,
  createLinearGradient,
  createRaster,
  createRaster2D,
  type Raster,
  type Raster2D,
} from "../../vendor/dotframe/src/raster2d";
import { clamp, seeded, shade, TAU } from "./util";
import { dcos, dsin } from "../../vendor/dotframe/src/detmath";

export const PX = 2; // stage pixel scale
const OUT = "#1a1020";
// World region covered by the stage layer (low resolution).
const WX0 = -300;
const WY0 = 0;
const WW = 2200;
const WH = 1200;
const toL = (v: number): number => Math.round(v / PX);

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Platform {
  x1: number;
  x2: number;
  y: number;
  bottom: number;
  main: boolean;
  soft: boolean;
  gondola: boolean;
  move: PlatformMove | null;
  // Rest position and per-frame motion, for moving platforms.
  bx1: number;
  bx2: number;
  by: number;
  dx: number;
  dy: number;
}

export interface PlatformMove {
  ax: number;
  ay: number;
  period: number;
}

export interface Ledge {
  x: number;
  y: number;
  side: number;
  occupant: number;
}

export interface Blast {
  l: number;
  r: number;
  t: number;
  b: number;
}

export interface Spawn {
  x: number;
  y: number;
}

interface Baked {
  bg: Raster;
  mid: Raster;
  fg: Raster;
}

export interface StageArt {
  bg: Texture;
  mid: Texture;
  fg: Texture;
}

export interface Stage {
  id: string;
  name: string;
  music: string;
  platforms: Platform[];
  main: Platform;
  ledges: Ledge[];
  blast: Blast;
  spawns: Spawn[];
  art: StageArt;
}

interface PlatformSpec {
  x1: number;
  x2: number;
  y: number;
  bottom: number;
  main: boolean;
  soft: boolean;
  gondola: boolean;
  move: PlatformMove | null;
}

interface StageDef {
  id: string;
  name: string;
  music: string;
  platforms: PlatformSpec[];
  blast: Blast;
  spawns: Spawn[];
}

const solid = (x1: number, x2: number, y: number, bottom: number): PlatformSpec => ({
  x1,
  x2,
  y,
  bottom,
  main: true,
  soft: false,
  gondola: false,
  move: null,
});
const soft = (x1: number, x2: number, y: number): PlatformSpec => ({
  x1,
  x2,
  y,
  bottom: y,
  main: false,
  soft: true,
  gondola: false,
  move: null,
});

const BLAST: Blast = { l: -480, r: 2080, t: -460, b: 1330 };

export const STAGES: StageDef[] = [
  {
    id: "station",
    name: "Templo Crafter",
    music: "battlefield",
    platforms: [solid(360, 1240, 600, 660), soft(470, 670, 460), soft(930, 1130, 460), soft(700, 900, 330)],
    blast: BLAST,
    spawns: [
      { x: 560, y: 600 },
      { x: 1040, y: 600 },
    ],
  },
  {
    id: "final",
    name: "Destino Final",
    music: "final_destination",
    platforms: [solid(360, 1240, 600, 650)],
    blast: BLAST,
    spawns: [
      { x: 540, y: 600 },
      { x: 1060, y: 600 },
    ],
  },
  {
    id: "lima",
    name: "Azotea Lima",
    music: "big_blue",
    platforms: [
      solid(380, 1220, 600, 660),
      soft(440, 630, 465),
      soft(970, 1160, 465),
      { x1: 720, x2: 880, y: 320, bottom: 320, main: false, soft: true, gondola: true, move: { ax: 250, ay: 20, period: 720 } },
    ],
    blast: BLAST,
    spawns: [
      { x: 540, y: 600 },
      { x: 1060, y: 600 },
    ],
  },
];

interface Canvas {
  raster: Raster;
  ctx: Raster2D;
}

function mkCanvas(width: number, height: number): Canvas {
  const raster = createRaster(width, height);
  return { raster, ctx: createRaster2D(raster) };
}

// Stage layer helpers in low-res stage coordinates.
interface Layer {
  g: Raster2D;
  X: (v: number) => number;
  Y: (v: number) => number;
  R: (x: number, y: number, w: number, h: number, color: string) => void;
}

function stageLayer(): Canvas & Layer {
  const canvas = mkCanvas(WW / PX, WH / PX);
  const g = canvas.ctx;
  return {
    raster: canvas.raster,
    ctx: g,
    g,
    X: (v: number): number => toL(v - WX0),
    Y: (v: number): number => toL(v - WY0),
    R: (x: number, y: number, w: number, h: number, color: string): void => {
      g.setFillStyle(color);
      g.fillRect(x, y, w, h);
    },
  };
}

// ======== TEMPLO CRAFTER ========
function bakeTemple(platforms: PlatformSpec[]): Baked {
  const r = seeded(9);
  const bgCanvas = mkCanvas(400, 240);
  const b = bgCanvas.ctx;
  const sky = createLinearGradient(0, 0, 0, 240);
  addColorStop(sky, 0, "#2a55c8");
  addColorStop(sky, 0.6, "#5b8ff0");
  addColorStop(sky, 1, "#a9d0ff");
  b.setFillGradient(sky);
  b.fillRect(0, 0, 400, 240);
  for (let y = 0; y < 240; y += 2) {
    for (let x = (y / 2) % 2; x < 400; x += 2) {
      if (r() < 0.05) {
        b.setFillStyle("rgba(255,255,255,.08)");
        b.fillRect(x, y, 1, 1);
      }
    }
  }
  const mount = (base: number, col: string, dark: string, peaks: number[][], seed: number): void => {
    const rr = seeded(seed);
    const pts: number[] = [];
    for (let x = 0; x <= 400; x += 4) {
      let h = 0;
      for (const peak of peaks) h = Math.max(h, peak[1] * Math.max(0, 1 - Math.abs(x - peak[0]) / peak[2]));
      pts.push(x, base - h + Math.floor(rr() * 3));
    }
    b.setFillStyle(col);
    for (let i = 0; i < pts.length; i += 2) b.fillRect(pts[i], pts[i + 1], 4, 240 - pts[i + 1]);
    b.setFillStyle(dark);
    for (let i = 0; i < pts.length; i += 2) if ((pts[i] / 4) % 3 === 0) b.fillRect(pts[i], pts[i + 1] + 6, 2, 240 - pts[i + 1]);
    b.setFillStyle(shade(col, 30));
    for (let i = 0; i < pts.length; i += 2) b.fillRect(pts[i], pts[i + 1], 4, 2);
  };
  mount(170, "#8e6fc9", "#7a5cb5", [[60, 110, 90], [170, 140, 80], [300, 120, 100], [390, 90, 60]], 3);
  b.setFillStyle("#bfe6ff");
  b.fillRect(58, 70, 5, 110);
  b.fillRect(300, 60, 4, 110);
  b.setFillStyle("#ffffff");
  b.fillRect(59, 70, 2, 110);
  b.fillRect(301, 60, 1, 110);
  mount(200, "#6b4fa8", "#5a4192", [[110, 80, 90], [250, 95, 110], [360, 70, 70]], 5);

  const midCanvas = mkCanvas(500, 240);
  const m = midCanvas.ctx;
  for (let i = 0; i < 70; i++) {
    const x = Math.floor(r() * 520) - 10;
    const y = 150 + Math.floor(r() * 30);
    const s = 10 + Math.floor(r() * 16);
    m.setFillStyle("#1f6b3a");
    m.fillRect(x - s, y, s * 2, 240 - y);
    for (let k = 0; k < s; k += 2) {
      m.setFillStyle(k < 4 ? "#3f9a4c" : "#2c7f40");
      const lift = Math.floor(Math.sqrt(s * s - (s - k) * (s - k)) * 0.8);
      m.fillRect(x - s + k, y - lift, 2, 3);
      m.fillRect(x + s - k - 2, y - lift, 2, 3);
    }
    m.setFillStyle("#2c7f40");
    m.fillRect(x - s + 2, y - s * 0.6, s * 2 - 4, s);
    m.setFillStyle("#56b35a");
    m.fillRect(x - s + 4, y - s * 0.6, s - 4, 2);
  }
  m.setFillStyle("#175a30");
  m.fillRect(0, 200, 500, 40);
  m.setFillStyle("#b8a7d8");
  for (let i = 0; i < 26; i++) m.fillRect(240 - i * 2, 120 + i * 2, i * 4, 2);
  m.setFillStyle("#9d8cc4");
  for (let i = 0; i < 26; i++) m.fillRect(240, 120 + i * 2, i * 2, 2);

  const fg = stageLayer();
  const { X, Y, R } = fg;
  const p = platforms[0];
  const x1 = X(p.x1);
  const x2 = X(p.x2);
  const y1 = Y(p.y);
  const y2 = Y(p.bottom) + 34;
  const pillar = (cx: number, top: number, broken: boolean): void => {
    const w = 18;
    R(cx - w / 2 - 1, top - 1, w + 2, y1 - top + 1, OUT);
    R(cx - w / 2, top, w, y1 - top, "#e9cf68");
    for (let i = 2; i < w; i += 4) R(cx - w / 2 + i, top, 1, y1 - top, "#c9a948");
    R(cx - w / 2, top, 3, y1 - top, "#f7e7a1");
    R(cx - w / 2 - 3, y1 - 6, w + 6, 6, "#d8bb55");
    R(cx - w / 2 - 3, y1 - 6, w + 6, 1, OUT);
    if (!broken) {
      R(cx - w / 2 - 3, top - 5, w + 6, 5, "#d8bb55");
      R(cx - w / 2 - 4, top - 6, w + 8, 1, OUT);
    } else {
      for (let i = 0; i < w; i += 3) R(cx - w / 2 + i, top - (i % 2 ? 4 : 1), 3, 4, "#e9cf68");
    }
    for (let k = 0; k < 5; k++) {
      const vy = top + 10 + k * 22;
      R(cx - 4 + (k % 2) * 6, vy, 2, 8, "#3f9a4c");
      R(cx - 6 + (k % 2) * 6, vy + 4, 4, 2, "#56b35a");
    }
  };
  pillar(X(p.x1 + 40), y1 - 150, true);
  pillar(X(p.x2 - 40), y1 - 170, false);
  pillar(X(p.x2 - 120), y1 - 120, true);
  for (const ox of [700, 900]) {
    const cx = X(ox);
    R(cx - 5, y1 - 40, 10, 40, OUT);
    R(cx - 4, y1 - 39, 8, 39, "#3a3f86");
    for (let i = 0; i < 40; i += 4) R(cx - 4, y1 - 39 + i, 8, 1, "#5a61b8");
    R(cx - 7, y1 - 44, 14, 5, "#5a61b8");
    R(cx - 6, y1 - 56, 12, 12, OUT);
    R(cx - 5, y1 - 55, 10, 10, "#bfe9ff");
    R(cx - 3, y1 - 53, 3, 3, "#fff");
  }
  R(x1 - 1, y1 - 1, x2 - x1 + 2, y2 - y1 + 2, OUT);
  for (let yy = y1; yy < y2; yy += 6) {
    for (let xx = x1; xx < x2; xx += 6) {
      const on = ((xx - x1) / 6 + (yy - y1) / 6) % 2 === 0;
      R(xx, yy, Math.min(6, x2 - xx), Math.min(6, y2 - yy), on ? "#f0dc84" : "#d6bd5c");
    }
  }
  for (let cx = x1 + 22; cx < x2 - 10; cx += 58) {
    R(cx - 5, y1 + 14, 10, y2 - y1 - 14, "#e2c25e");
    R(cx - 5, y1 + 14, 2, y2 - y1 - 14, "#f7e7a1");
    R(cx + 3, y1 + 14, 2, y2 - y1 - 14, "#b9983e");
    R(cx - 6, y1 + 14, 1, y2 - y1 - 14, OUT);
    R(cx + 5, y1 + 14, 1, y2 - y1 - 14, OUT);
  }
  for (let xx = x1; xx < x2; xx += 3) {
    const d = 2 + Math.floor(r() * 6);
    R(xx, y2, 3, d, "#b9983e");
    R(xx, y2 + d, 3, 1, OUT);
    if (r() < 0.12) R(xx + 1, y2 + d, 1, 6 + Math.floor(r() * 10), "#6b4a2a");
  }
  R(x1 - 2, y1 - 1, x2 - x1 + 4, 7, "#5fb13a");
  R(x1 - 2, y1 - 1, x2 - x1 + 4, 2, "#8fdc5a");
  for (let xx = x1 - 2; xx < x2 + 2; xx += 2) {
    const d = r() < 0.3 ? 4 + Math.floor(r() * 10) : Math.floor(r() * 4);
    R(xx, y1 + 6, 2, d, "#5fb13a");
    R(xx, y1 + 6 + d, 2, 1, "#3d8a26");
  }
  for (let xx = x1; xx < x2; xx += 5) if (r() < 0.5) R(xx, y1 - 3, 1, 2, "#8fdc5a");
  R(x1 - 3, y1 - 2, x2 - x1 + 6, 1, OUT);
  for (const q of platforms) {
    if (!q.soft) continue;
    const a = X(q.x1);
    const bb = X(q.x2);
    const yy = Y(q.y);
    R(a - 1, yy - 1, bb - a + 2, 9, OUT);
    R(a, yy, bb - a, 7, "#e9cf68");
    R(a, yy, bb - a, 2, "#8fdc5a");
    for (let xx = a; xx < bb; xx += 8) R(xx, yy + 3, 1, 4, "#c9a948");
    for (let xx = a; xx < bb; xx += 2) if (r() < 0.35) R(xx, yy + 7, 2, 2 + Math.floor(r() * 4), "#5fb13a");
  }
  return { bg: bgCanvas.raster, mid: midCanvas.raster, fg: fg.raster };
}

// ======== DESTINO FINAL ========
function bakeFinal(platforms: PlatformSpec[]): Baked {
  const r = seeded(21);
  const bgCanvas = mkCanvas(400, 240);
  const b = bgCanvas.ctx;
  b.setFillStyle("#05030f");
  b.fillRect(0, 0, 400, 240);
  const blob = (cx: number, cy: number, rad: number, cols: string[]): void => {
    for (let i = 0; i < 900; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * rad;
      const x = Math.round(cx + dcos(a) * d);
      const y = Math.round(cy + dsin(a) * d * 0.6);
      b.setFillStyle(cols[Math.floor((d / rad) * cols.length)]);
      b.fillRect(x, y, 2, 2);
    }
  };
  blob(110, 90, 80, ["#6a2fb0", "#4b1f86", "#2e1459", "#1a0c35"]);
  blob(300, 150, 90, ["#1f6fd6", "#1a4fa0", "#12306a", "#0b1a3a"]);
  for (let i = 0; i < 180; i++) {
    b.setFillStyle(r() < 0.2 ? "#bfe9ff" : "#ffffff");
    b.fillRect(Math.floor(r() * 400), Math.floor(r() * 240), 1, 1);
  }
  for (let y = -26; y <= 26; y++) {
    for (let x = -26; x <= 26; x++) {
      if (x * x + y * y <= 26 * 26) {
        b.setFillStyle(x + y < -10 ? "#7fd6ff" : x + y < 14 ? "#3a8fd8" : "#20528f");
        b.fillRect(330 + x, 50 + y, 1, 1);
      }
    }
  }
  b.setFillStyle("#c9f0ff");
  for (let x = -40; x <= 40; x++) b.fillRect(330 + x, 50 + Math.round(x * 0.2), 1, 1);
  const midCanvas = mkCanvas(500, 240);
  const m = midCanvas.ctx;
  for (let i = 0; i < 60; i++) {
    m.setFillStyle("#ffffff");
    m.fillRect(Math.floor(r() * 500), Math.floor(r() * 240), 2, 2);
  }
  const fg = stageLayer();
  const { X, Y, R } = fg;
  const p = platforms[0];
  const x1 = X(p.x1);
  const x2 = X(p.x2);
  const y1 = Y(p.y);
  const y2 = Y(p.bottom);
  const cx = (x1 + x2) / 2;
  for (let i = 0; i < 70; i++) {
    const half = Math.max(8, (x2 - x1) / 2 - 12 - i * 3.6);
    R(Math.round(cx - half) - 1, y2 + i, Math.round(half * 2) + 2, 1, OUT);
    R(Math.round(cx - half), y2 + i, Math.round(half * 2), 1, i % 10 < 1 ? "#2f3a78" : "#141a3e");
    if (i % 10 === 5) {
      R(Math.round(cx - half) + 4, y2 + i, 3, 1, "#4fd2ff");
      R(Math.round(cx + half) - 7, y2 + i, 3, 1, "#4fd2ff");
    }
  }
  R(cx - 4, y2 + 30, 8, 12, "#4fd2ff");
  R(cx - 2, y2 + 32, 4, 8, "#e8fbff");
  R(x1 - 1, y1 - 1, x2 - x1 + 2, y2 - y1 + 2, OUT);
  R(x1, y1, x2 - x1, y2 - y1, "#262d63");
  R(x1, y1, x2 - x1, 3, "#9fe8ff");
  R(x1, y1 + 3, x2 - x1, 2, "#4fa8e0");
  for (let xx = x1 + 8; xx < x2 - 8; xx += 20) {
    R(xx, y1 + 9, 10, 2, "#3a4590");
    R(xx + 2, y1 + 13, 6, 1, "#1b2150");
  }
  R(x1, y2 - 3, x2 - x1, 3, "#161b44");
  return { bg: bgCanvas.raster, mid: midCanvas.raster, fg: fg.raster };
}

// ======== AZOTEA LIMA ========
function bakeLima(platforms: PlatformSpec[]): Baked {
  const r = seeded(33);
  const bgCanvas = mkCanvas(400, 240);
  const b = bgCanvas.ctx;
  const bands = ["#2b1b5a", "#4a2370", "#7a2f7e", "#b54783", "#e0607c", "#f58a6e", "#ffb36b", "#ffd28a"];
  for (let i = 0; i < bands.length; i++) {
    b.setFillStyle(bands[i]);
    b.fillRect(0, i * 20, 400, 20);
  }
  for (let i = 1; i < bands.length; i++) {
    for (let x = 0; x < 400; x += 2) {
      b.setFillStyle(bands[i]);
      b.fillRect(x + (i % 2), i * 20 - 2, 1, 1);
      b.setFillStyle(bands[i - 1]);
      b.fillRect(x, i * 20 + 1, 1, 1);
    }
  }
  for (let y = -22; y <= 22; y++) {
    for (let x = -22; x <= 22; x++) {
      if (x * x + y * y <= 22 * 22) {
        b.setFillStyle(y > 8 && y % 4 < 2 ? "#ffb36b" : "#fff1c1");
        b.fillRect(200 + x, 150 + y, 1, 1);
      }
    }
  }
  b.setFillStyle("#5a3f7a");
  b.fillRect(0, 165, 400, 75);
  for (let y = 168; y < 240; y += 4) {
    for (let x = 0; x < 400; x += 12) {
      if (r() < 0.5) {
        b.setFillStyle(Math.abs(x - 200) < 40 ? "#ffd28a" : "#7a5c9a");
        b.fillRect(x + Math.floor(r() * 6), y, 6, 1);
      }
    }
  }
  b.setFillStyle("#6b3d5a");
  for (let x = 0; x < 130; x += 2) {
    const h = 30 + Math.floor(dsin(x * 0.08) * 6) + Math.floor(r() * 3);
    b.fillRect(x, 165 - h, 2, 75 + h);
  }
  b.setFillStyle("#4f2c44");
  for (let x = 0; x < 130; x += 6) b.fillRect(x, 150, 2, 90);
  const midCanvas = mkCanvas(500, 240);
  const m = midCanvas.ctx;
  let x = 0;
  while (x < 500) {
    const w = 20 + Math.floor(r() * 30);
    const h = 40 + Math.floor(r() * 90);
    m.setFillStyle("#3d2346");
    m.fillRect(x, 240 - h, w, h);
    m.setFillStyle("#2c1834");
    m.fillRect(x + w - 3, 240 - h, 3, h);
    for (let wy = 240 - h + 5; wy < 236; wy += 7) {
      for (let wx = x + 3; wx < x + w - 5; wx += 5) {
        if (r() < 0.4) {
          m.setFillStyle(r() < 0.7 ? "#ffe39a" : "#ffb36b");
          m.fillRect(wx, wy, 2, 3);
        }
      }
    }
    x += w + 2;
  }
  const fg = stageLayer();
  const { X, Y, R } = fg;
  const p = platforms[0];
  const x1 = X(p.x1);
  const x2 = X(p.x2);
  const y1 = Y(p.y);
  const y2 = Y(p.bottom);
  R(x1 + 6, y2, x2 - x1 - 12, 250, "#4a3350");
  for (let yy = y2 + 10; yy < y2 + 250; yy += 20) {
    for (let xx = x1 + 16; xx < x2 - 20; xx += 22) {
      R(xx, yy, 11, 12, OUT);
      R(xx + 1, yy + 1, 9, 10, r() < 0.5 ? "#ffe39a" : "#6d4d74");
    }
  }
  const tx = X(1080);
  R(tx - 1, y1 - 44, 32, 30, OUT);
  R(tx, y1 - 43, 30, 28, "#6d4d74");
  R(tx, y1 - 43, 30, 3, "#8e6a93");
  R(tx + 3, y1 - 15, 3, 15, OUT);
  R(tx + 24, y1 - 15, 3, 15, OUT);
  const ax = X(470);
  R(ax, y1 - 34, 2, 34, OUT);
  R(ax - 1, y1 - 36, 4, 3, "#ff3355");
  R(x1 - 1, y1 - 1, x2 - x1 + 2, y2 - y1 + 2, OUT);
  R(x1, y1, x2 - x1, y2 - y1, "#7d5a78");
  R(x1, y1, x2 - x1, 3, "#d9a4be");
  R(x1, y1 + 3, x2 - x1, 1, "#a07590");
  for (let xx = x1 + 4; xx < x2 - 4; xx += 10) R(xx, y1 + 7, 6, 2, "#5f4260");
  const railing = (a: number, bb: number): void => {
    R(a, y1 - 9, bb - a, 2, OUT);
    for (let xx = a; xx < bb; xx += 5) R(xx, y1 - 9, 1, 9, OUT);
  };
  railing(x1, x1 + 26);
  railing(x2 - 26, x2);
  for (const q of platforms) {
    if (!q.soft || q.gondola) continue;
    const a = X(q.x1);
    const bb = X(q.x2);
    const yy = Y(q.y);
    R(a - 1, yy - 1, bb - a + 2, 6, OUT);
    R(a, yy, bb - a, 4, "#c98a45");
    R(a, yy, bb - a, 1, "#eab26a");
    R(a + 3, yy + 4, 3, 12, OUT);
    R(bb - 6, yy + 4, 3, 12, OUT);
  }
  return { bg: bgCanvas.raster, mid: midCanvas.raster, fg: fg.raster };
}

const bakes: Map<string, StageArt> = new Map();

function bake(def: StageDef, gpu: RenderGpu): StageArt {
  const cached = bakes.get(def.id);
  if (cached) return cached;
  const baked = def.id === "station" ? bakeTemple(def.platforms) : def.id === "final" ? bakeFinal(def.platforms) : bakeLima(def.platforms);
  const upload = (raster: Raster): Texture => gpu.createTexture(raster.width, raster.height, raster.pixels, false);
  const art: StageArt = { bg: upload(baked.bg), mid: upload(baked.mid), fg: upload(baked.fg) };
  bakes.set(def.id, art);
  return art;
}

export function makeStage(id: string, gpu: RenderGpu): Stage {
  let def = STAGES[0];
  for (const candidate of STAGES) if (candidate.id === id) def = candidate;
  const platforms: Platform[] = [];
  for (const spec of def.platforms) {
    platforms.push({
      x1: spec.x1,
      x2: spec.x2,
      y: spec.y,
      bottom: spec.bottom,
      main: spec.main,
      soft: spec.soft,
      gondola: spec.gondola,
      move: spec.move,
      bx1: spec.x1,
      bx2: spec.x2,
      by: spec.y,
      dx: 0,
      dy: 0,
    });
  }
  let main = platforms[0];
  for (const platform of platforms) if (platform.main) main = platform;
  return {
    id: def.id,
    name: def.name,
    music: def.music,
    platforms,
    main,
    ledges: [
      { x: main.x1, y: main.y, side: -1, occupant: -1 },
      { x: main.x2, y: main.y, side: 1, occupant: -1 },
    ],
    blast: def.blast,
    spawns: def.spawns,
    art: bake(def, gpu),
  };
}

export function updateStage(stage: Stage, frame: number): void {
  for (const p of stage.platforms) {
    const move = p.move;
    if (!move) continue;
    const ph = (frame / move.period) * TAU;
    const nx1 = p.bx1 + dsin(ph) * move.ax;
    const ny = p.by + dsin(ph * 2) * move.ay;
    p.dx = nx1 - p.x1;
    p.dy = ny - p.y;
    p.x2 += p.dx;
    p.x1 = nx1;
    p.y = ny;
  }
}

// Draws a background layer covering the screen with parallax.
function drawLayer(ctx: Draw2D, layer: Texture, W: number, H: number, cam: Camera, par: number, anchorY: number): void {
  const sc = Math.max(W / layer.width, H / layer.height) * 1.12;
  const lw = layer.width * sc;
  const lh = layer.height * sc;
  const ox = clamp(-(cam.x - 800) * par * cam.zoom, -(lw - W) / 2, (lw - W) / 2);
  const oy = clamp(-(cam.y - 450) * par * 0.6 * cam.zoom, -(lh - H) / 2, (lh - H) / 2);
  ctx.drawImage(
    layer,
    0,
    0,
    layer.width,
    layer.height,
    Math.round((W - lw) / 2 + ox),
    Math.round((H - lh) * anchorY + oy),
    Math.round(lw),
    Math.round(lh),
  );
}

export function drawStageBackground(stage: Stage, ctx: Draw2D, W: number, H: number, cam: Camera, t: number): void {
  const art = stage.art;
  if (stage.id === "station") {
    drawLayer(ctx, art.bg, W, H, cam, 0.04, 0.5);
    const sc = Math.max(W / 400, H / 240);
    const puffs = [
      [0, 4, 26, 6],
      [4, 0, 12, 6],
      [14, 2, 8, 4],
      [-4, 7, 34, 4],
    ];
    for (let i = 0; i < 5; i++) {
      const cx = ((t * 0.15 * (1 + i * 0.3) + i * 260) % (W + 400)) - 200;
      const cy = H * (0.08 + i * 0.06);
      ctx.setFillStyle("#ffffff");
      for (const puff of puffs) ctx.fillRect(cx + puff[0] * sc, cy + puff[1] * sc, puff[2] * sc, puff[3] * sc);
      ctx.setFillStyle("#d7e8ff");
      ctx.fillRect(cx - 4 * sc, cy + 10 * sc, 34 * sc, 1 * sc);
    }
    drawLayer(ctx, art.mid, W, H, cam, 0.12, 0.62);
  } else if (stage.id === "final") {
    drawLayer(ctx, art.bg, W, H, cam, 0.03, 0.5);
    ctx.setGlobalAlpha(0.5 + 0.5 * dsin(t * 0.05));
    drawLayer(ctx, art.mid, W, H, cam, 0.08, 0.5);
    ctx.setGlobalAlpha(1);
  } else {
    drawLayer(ctx, art.bg, W, H, cam, 0.03, 0.5);
    const sc = Math.max(W / 400, H / 240);
    const colors = ["#e8323f", "#2f8fe8", "#ffd23f"];
    for (let i = 0; i < 3; i++) {
      const px = ((t * (0.25 + i * 0.1) + i * 700) % (W + 400)) - 200;
      const py = H * (0.16 + i * 0.09) + Math.round(dsin(t * 0.02 + i) * 3) * sc;
      ctx.setFillStyle(colors[i]);
      ctx.fillRect(px - 8 * sc, py, 16 * sc, 2 * sc);
      ctx.fillRect(px - 6 * sc, py - sc, 12 * sc, sc);
      ctx.setFillStyle("#2a1640");
      ctx.fillRect(px - 7 * sc, py + 2 * sc, sc, 6 * sc);
      ctx.fillRect(px + 6 * sc, py + 2 * sc, sc, 6 * sc);
      ctx.fillRect(px - sc, py + 8 * sc, 2 * sc, 3 * sc);
    }
    drawLayer(ctx, art.mid, W, H, cam, 0.15, 0.75);
  }
}

// Draws the stage layer in world space (the caller sets the camera transform).
export function drawStageForeground(stage: Stage, ctx: Draw2D): void {
  ctx.drawImage(stage.art.fg, 0, 0, stage.art.fg.width, stage.art.fg.height, WX0, WY0, WW, WH);
  for (const p of stage.platforms) {
    if (!p.gondola) continue;
    const x = Math.round(p.x1 / PX) * PX;
    const y = Math.round(p.y / PX) * PX;
    const w = p.x2 - p.x1;
    const cx = x + w / 2;
    ctx.setFillStyle(OUT);
    for (let i = 0; i < 300; i += 3) {
      ctx.fillRect(x + 12 + (cx - x - 12) * (i / 300) - 1, y - i * 3, 3, 3);
      ctx.fillRect(x + w - 12 - (x + w - 12 - cx) * (i / 300) - 1, y - i * 3, 3, 3);
    }
    ctx.fillRect(x - 3, y - 3, w + 6, 42);
    ctx.setFillStyle("#e8b04a");
    ctx.fillRect(x, y, w, 12);
    ctx.setFillStyle("#9c6c1e");
    ctx.fillRect(x, y + 12, w, 24);
    ctx.setFillStyle("#ffd98a");
    ctx.fillRect(x, y, w, 3);
    ctx.setFillStyle(OUT);
    ctx.setFont('12px "Press Start 2P", monospace');
    ctx.setTextAlign("center");
    ctx.fillText("LIMPIEZA", cx, y + 30);
  }
}
