// Inputs packed into one integer for netplay: stick axes quantized to 8 bits, c-stick and buttons as bits.
// Both peers simulate from the decoded value, so quantization keeps them identical.
import { emptyInput, type RawInput } from "./input";

const axis = (v: number): number => Math.max(-127, Math.min(127, Math.round(v * 127))) + 127;
const unaxis = (b: number): number => (b - 127) / 127;
const tri = (v: number): number => (v > 0 ? 2 : v < 0 ? 0 : 1);

export function encodeInput(r: RawInput): number {
  let bits = axis(r.x) | (axis(r.y) << 8) | (tri(r.cx) << 16) | (tri(r.cy) << 18);
  if (r.attack) bits |= 1 << 20;
  if (r.special) bits |= 1 << 21;
  if (r.shield) bits |= 1 << 22;
  if (r.grab) bits |= 1 << 23;
  if (r.jump) bits |= 1 << 24;
  if (r.taunt) bits |= 1 << 25;
  return bits;
}

export function decodeInput(bits: number): RawInput {
  const o = emptyInput();
  o.x = unaxis(bits & 255);
  o.y = unaxis((bits >> 8) & 255);
  o.cx = ((bits >> 16) & 3) - 1;
  o.cy = ((bits >> 18) & 3) - 1;
  o.attack = (bits & (1 << 20)) !== 0;
  o.special = (bits & (1 << 21)) !== 0;
  o.shield = (bits & (1 << 22)) !== 0;
  o.grab = (bits & (1 << 23)) !== 0;
  o.jump = (bits & (1 << 24)) !== 0;
  o.taunt = (bits & (1 << 25)) !== 0;
  return o;
}

export const NEUTRAL_INPUT = encodeInput(emptyInput());
