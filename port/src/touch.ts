// On-screen controls for phones: a floating joystick on the left half and four buttons on the right.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import type { Input, Touch } from "../../vendor/dotframe/src/input";
import type { Fighter } from "./fighter";
import type { Game } from "./game";
import { type Controller, emptyInput, type RawInput, TAP_JUMP } from "./input";
import { clamp, TAU } from "./util";
import { dhypot } from "../../vendor/dotframe/src/detmath";

interface Button {
  label: string;
  color: string;
  // Center relative to the bottom-right corner, in logical pixels.
  dx: number;
  dy: number;
}

const BUTTONS: Button[] = [
  { label: "A", color: "#e8323f", dx: -150, dy: -110 },
  { label: "B", color: "#2f8fe8", dx: -70, dy: -190 },
  { label: "↑", color: "#7ed957", dx: -230, dy: -190 },
  { label: "◎", color: "#ffd23f", dx: -150, dy: -270 },
];
const BUTTON_RADIUS = 46;
const STICK_RADIUS = 80;

export interface TouchControls {
  controller: Controller;
  draw: (ctx: Draw2D) => void;
}

// width/height: the logical resolution the game draws at, so touches map to the same space.
export function createTouchControls(input: Input, width: number, height: number): TouchControls {
  let stickId = -1;
  let originX = 0;
  let originY = 0;
  let stickX = 0;
  let stickY = 0;
  const pressed: boolean[] = [false, false, false, false];

  const update = (): void => {
    const touches: Touch[] = input.touches();
    let stillDown = false;
    for (let b = 0; b < pressed.length; b++) pressed[b] = false;
    for (const t of touches) {
      const x = t.x * width;
      const y = t.y * height;
      if (t.id === stickId) {
        stillDown = true;
        const dx = x - originX;
        const dy = y - originY;
        const length = dhypot(dx, dy);
        const scale = length > STICK_RADIUS ? STICK_RADIUS / length : 1;
        stickX = (dx * scale) / STICK_RADIUS;
        stickY = (dy * scale) / STICK_RADIUS;
        continue;
      }
      if (x < width / 2) {
        if (stickId < 0) {
          stickId = t.id;
          originX = x;
          originY = y;
          stickX = 0;
          stickY = 0;
          stillDown = true;
        }
        continue;
      }
      for (let b = 0; b < BUTTONS.length; b++) {
        const bx = width + BUTTONS[b].dx;
        const by = height + BUTTONS[b].dy;
        if (dhypot(x - bx, y - by) < BUTTON_RADIUS * 1.25) pressed[b] = true;
      }
    }
    if (!stillDown) {
      stickId = -1;
      stickX = 0;
      stickY = 0;
    }
  };

  const controller: Controller = {
    isCPU: false,
    read: (_f: Fighter, _g: Game): RawInput => {
      update();
      const o = emptyInput();
      o.x = Math.abs(stickX) > 0.2 ? clamp(stickX * 1.2, -1, 1) : 0;
      o.y = Math.abs(stickY) > 0.2 ? clamp(-stickY * 1.2, -1, 1) : 0;
      o.attack = pressed[0];
      o.special = pressed[1];
      o.jump = pressed[2];
      o.shield = pressed[3];
      if (TAP_JUMP[0] && o.y >= 0.7) o.jump = true;
      return o;
    },
  };

  const draw = (ctx: Draw2D): void => {
    ctx.resetTransform();
    ctx.setGlobalAlpha(0.35);
    if (stickId >= 0) {
      ctx.setFillStyle("#ffffff");
      ctx.beginPath();
      ctx.arc(originX, originY, STICK_RADIUS, 0, TAU, false);
      ctx.fill();
      ctx.setGlobalAlpha(0.7);
      ctx.beginPath();
      ctx.arc(originX + stickX * STICK_RADIUS, originY + stickY * STICK_RADIUS, 34, 0, TAU, false);
      ctx.fill();
    } else {
      ctx.setFillStyle("#ffffff");
      ctx.beginPath();
      ctx.arc(170, height - 170, STICK_RADIUS, 0, TAU, false);
      ctx.fill();
    }
    ctx.setFont("40px Bangers");
    ctx.setTextAlign("center");
    ctx.setTextBaseline("middle");
    for (let b = 0; b < BUTTONS.length; b++) {
      const button = BUTTONS[b];
      const x = width + button.dx;
      const y = height + button.dy;
      ctx.setGlobalAlpha(pressed[b] ? 0.85 : 0.45);
      ctx.setFillStyle(button.color);
      ctx.beginPath();
      ctx.arc(x, y, BUTTON_RADIUS, 0, TAU, false);
      ctx.fill();
      ctx.setFillStyle("#ffffff");
      ctx.fillText(button.label, x, y + 2);
    }
    ctx.setGlobalAlpha(1);
  };

  return { controller, draw };
}
