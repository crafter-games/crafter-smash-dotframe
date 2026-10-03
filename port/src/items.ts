// Items and summons (Kirbys, Pokémon, Miku, cat memes) and prop drawings, ported from js/items.js.
import type { Draw2D } from "../../../dotframe/src/draw2d";
import type { Texture } from "../../../dotframe/src/gpu";
import type { Projectile } from "./game";
import { TAU } from "./util";

export const ITEM_NAMES: string[] = [
  "kirby",
  "kirby_happy",
  "kirby_star",
  "kirby_big",
  "kirby_ball0",
  "kirby_ball1",
  "kirby_ball2",
  "kirby_ball3",
  "pikachu",
  "charmander",
  "squirtle",
  "bulbasaur",
  "charizard",
  "pokeball",
  "miku0",
  "miku1",
  "miku2",
  "miku3",
  "miku4",
  "miku5",
  "miku6",
  "cat_yelling",
  "cat_nyan",
  "cat_keyboard",
  "cat_grumpy",
  "cat_long",
  "cat_bongo",
  "cat_bub",
  "cat_maru",
];
export const CAT_MEMES: string[] = ["cat_grumpy", "cat_yelling", "cat_keyboard", "cat_bongo", "cat_bub", "cat_maru", "cat_nyan"];
const MEME_CAPTIONS = new Map<string, string>([
  ["cat_grumpy", "NO."],
  ["cat_yelling", "¿¡QUÉ!?"],
  ["cat_keyboard", "♪ PLAY HIM OFF"],
  ["cat_bongo", "BONK"],
  ["cat_bub", ":3"],
  ["cat_maru", "if i fits..."],
  ["cat_nyan", "NYAN~"],
]);

const images = new Map<string, Texture>();

// Cat memes are photos and draw smoothed; everything else is pixel art.
// Cat memes are photos and should be created with linear filtering; everything else is pixel art.
export const itemIsSmooth = (name: string): boolean => name.startsWith("cat_");

export function setItem(name: string, texture: Texture): void {
  images.set(name, texture);
}

export function itemImage(name: string): Texture | null {
  return images.get(name) ?? null;
}

export interface ItemDrawOptions {
  rot?: number;
  flip?: boolean;
  alpha?: number;
  anchorBottom?: boolean;
}

// Draws an image centered on (x, y) with height h.
export function drawItem(ctx: Draw2D, name: string, x: number, y: number, h: number, options: ItemDrawOptions): void {
  const im = images.get(name);
  if (!im) return;
  const s = h / im.height;
  const w = im.width * s;
  ctx.save();
  ctx.translate(x, y);
  const rot = options.rot ?? 0;
  if (rot) ctx.rotate(rot);
  ctx.scale(options.flip ? -1 : 1, 1);
  const alpha = options.alpha;
  if (alpha !== undefined) ctx.setGlobalAlpha(ctx.getGlobalAlpha() * alpha);
  const ay = options.anchorBottom ? -h : -h / 2;
  ctx.drawImage(im, 0, 0, im.width, im.height, -w / 2, ay, w, h);
  ctx.restore();
}

// Meme card: photo with a white frame and Impact-style caption.
export function drawMeme(ctx: Draw2D, name: string, x: number, y: number, size: number, rot: number): void {
  const im = images.get(name);
  if (!im) return;
  const ar = im.width / im.height;
  const h = size;
  const w = Math.min(size * 1.6, size * ar);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.setFillStyle("#fff");
  ctx.fillRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
  ctx.setStrokeStyle("#1a1020");
  ctx.setLineWidth(2);
  ctx.strokeRect(-w / 2 - 5, -h / 2 - 5, w + 10, h + 10);
  ctx.drawImage(im, 0, 0, im.width, im.height, -w / 2, -h / 2, w, h);
  const cap = MEME_CAPTIONS.get(name);
  if (cap !== undefined) {
    ctx.setFont(`900 ${Math.round(size * 0.2)}px Impact, "Arial Black", sans-serif`);
    ctx.setTextAlign("center");
    ctx.setTextBaseline("alphabetic");
    ctx.setLineWidth(4);
    ctx.setStrokeStyle("#000");
    ctx.strokeText(cap, 0, h / 2 - 6);
    ctx.setFillStyle("#fff");
    ctx.fillText(cap, 0, h / 2 - 6);
  }
  ctx.restore();
}

// Vercel triangle. The original's glow (shadowBlur) has no draw2d equivalent and is omitted.
export function drawVercel(ctx: Draw2D, x: number, y: number, s: number, rot: number, _glow: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.setFillStyle("#000");
  ctx.setStrokeStyle("#fff");
  ctx.setLineWidth(Math.max(2, s * 0.12));
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.6);
  ctx.lineTo(s * 0.62, s * 0.45);
  ctx.lineTo(-s * 0.62, s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Hammer (Anthony studied civil engineering).
export function drawHammer(ctx: Draw2D, x: number, y: number, ang: number, len: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.setFillStyle("#1a1020");
  ctx.fillRect(-4, -len, 8, len + 6);
  ctx.setFillStyle("#b8732e");
  ctx.fillRect(-2, -len, 4, len + 4);
  ctx.setFillStyle("#e39a50");
  ctx.fillRect(-2, -len, 1.5, len + 4);
  ctx.setFillStyle("#5b3a1c");
  ctx.fillRect(-3, -8, 6, 12);
  const hw = len * 0.62;
  const hh = len * 0.3;
  ctx.setFillStyle("#1a1020");
  ctx.fillRect(-hw / 2 - 3, -len - hh - 3, hw + 6, hh + 6);
  ctx.setFillStyle("#8a929c");
  ctx.fillRect(-hw / 2, -len - hh, hw, hh);
  ctx.setFillStyle("#c7ced6");
  ctx.fillRect(-hw / 2, -len - hh, hw, hh * 0.3);
  ctx.setFillStyle("#5c636c");
  ctx.fillRect(-hw / 2, -len - hh * 0.25, hw, hh * 0.25);
  ctx.setFillStyle("#ffd23f");
  ctx.fillRect(hw / 2 - 5, -len - hh, 5, hh);
  ctx.restore();
}

// OpenAI logo (six interlocking links). The original's glow is omitted.
export function drawOpenAI(ctx: Draw2D, x: number, y: number, s: number, rot: number, alpha: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.setGlobalAlpha(ctx.getGlobalAlpha() * alpha);
  ctx.setFillStyle("#0d1117");
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.95, 0, TAU, false);
  ctx.fill();
  ctx.setStrokeStyle("#ffffff");
  ctx.setLineWidth(Math.max(2, s * 0.11));
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 3);
    const w = s * 0.36;
    const h = s * 0.8;
    const ox = s * 0.18;
    const oy = -s * 0.62;
    const r = w / 2;
    ctx.beginPath();
    ctx.moveTo(ox - w / 2, oy + r);
    ctx.arc(ox, oy + r, r, Math.PI, 0, false);
    ctx.lineTo(ox + w / 2, oy + h - r);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

// Codex terminal (Railly's projectile).
export function drawCodexTerminal(ctx: Draw2D, p: Projectile): void {
  const k = Math.min(1, p.t / 5);
  const w = 120 * k;
  const h = 76 * k;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.setGlobalAlpha(ctx.getGlobalAlpha() * p.alpha);
  ctx.setFillStyle("#0d1117");
  ctx.setStrokeStyle("#10a37f");
  ctx.setLineWidth(3);
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fill();
  ctx.stroke();
  if (k >= 1) {
    ctx.setFillStyle("#1f2937");
    ctx.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, 12);
    const dots = ["#ff5f56", "#ffbd2e", "#27c93f"];
    for (let i = 0; i < dots.length; i++) {
      ctx.setFillStyle(dots[i]);
      ctx.beginPath();
      ctx.arc(-w / 2 + 10 + i * 9, -h / 2 + 8, 3, 0, TAU, false);
      ctx.fill();
    }
    drawOpenAI(ctx, w / 2 - 10, -h / 2 + 8, 6, 0, 1);
    ctx.setFont("bold 9px Menlo, monospace");
    ctx.setTextAlign("left");
    ctx.setTextBaseline("alphabetic");
    let chars = p.t * 4;
    for (let i = 0; i < p.lines.length; i++) {
      const ln = p.lines[i];
      const n = Math.max(0, Math.min(ln.length, chars));
      chars -= ln.length;
      ctx.setFillStyle(ln.startsWith("✓") ? "#27c93f" : ln.startsWith("$") ? "#ffffff" : "#10a37f");
      ctx.fillText(ln.slice(0, n) + (n < ln.length && n > 0 ? "█" : ""), -w / 2 + 6, -h / 2 + 26 + i * 12);
    }
  }
  ctx.restore();
}
