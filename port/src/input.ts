// Controller input shapes shared by human and CPU controllers, ported from js/input.js.
import type { Fighter } from "./fighter";
import type { Game } from "./game";

export interface RawInput {
  x: number;
  y: number;
  cx: number;
  cy: number;
  attack: boolean;
  special: boolean;
  shield: boolean;
  grab: boolean;
  jump: boolean;
  taunt: boolean;
}

// Per-frame input with press edges, as Fighter reads it.
export interface FrameInput extends RawInput {
  attackP: boolean;
  specialP: boolean;
  shieldP: boolean;
  grabP: boolean;
  jumpP: boolean;
  tauntP: boolean;
}

export interface Controller {
  isCPU: boolean;
  read: (f: Fighter, g: Game) => RawInput;
}

export const emptyInput = (): RawInput => ({
  x: 0,
  y: 0,
  cx: 0,
  cy: 0,
  attack: false,
  special: false,
  shield: false,
  grab: false,
  jump: false,
  taunt: false,
});

export const emptyFrameInput = (): FrameInput => ({
  x: 0,
  y: 0,
  cx: 0,
  cy: 0,
  attack: false,
  special: false,
  shield: false,
  grab: false,
  jump: false,
  taunt: false,
  attackP: false,
  specialP: false,
  shieldP: false,
  grabP: false,
  jumpP: false,
  tauntP: false,
});

// Tap jump (jump with up) per port.
export const TAP_JUMP: boolean[] = [true, true];
