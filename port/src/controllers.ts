// Human controller over dotframe input: remappable keyboard plus the standard-layout gamepad per port.
import { GamepadAxis, GamepadButton, type Input, keyCodes } from "../../vendor/dotframe/src/input";
import type { Fighter } from "./fighter";
import type { Game } from "./game";
import { type Controller, emptyInput, type RawInput, TAP_JUMP } from "./input";

export interface Keymap {
  up: string;
  down: string;
  left: string;
  right: string;
  jump: string;
  attack: string;
  special: string;
  shield: string;
  grab: string;
  taunt: string;
}

export const DEFAULT_KEYMAPS: Keymap[] = [
  { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD", jump: "Space", attack: "KeyF", special: "KeyG", shield: "KeyH", grab: "KeyR", taunt: "KeyV" },
  {
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
    jump: "KeyJ",
    attack: "KeyK",
    special: "KeyL",
    shield: "Semicolon",
    grab: "KeyI",
    taunt: "KeyO",
  },
];

const deadzone = (v: number): number => (Math.abs(v) < 0.25 ? 0 : v);

export function createHumanController(input: Input, port: number, keymap: Keymap): Controller {
  const key = (code: string): boolean => {
    const id = keyCodes.indexOf(code);
    return id >= 0 && input.down(id);
  };
  return {
    isCPU: false,
    read: (_f: Fighter, _g: Game): RawInput => {
      const o = emptyInput();
      o.x = (key(keymap.right) ? 1 : 0) - (key(keymap.left) ? 1 : 0);
      o.y = (key(keymap.up) ? 1 : 0) - (key(keymap.down) ? 1 : 0);
      o.attack = key(keymap.attack);
      o.special = key(keymap.special);
      o.shield = key(keymap.shield);
      o.grab = key(keymap.grab);
      o.jump = key(keymap.jump);
      o.taunt = key(keymap.taunt);
      // Gamepad N drives player N.
      const b = (button: number): boolean => input.button(port, button);
      let x = deadzone(input.axis(port, GamepadAxis.LeftX));
      let y = -deadzone(input.axis(port, GamepadAxis.LeftY));
      if (b(GamepadButton.DpadLeft)) x = -1;
      if (b(GamepadButton.DpadRight)) x = 1;
      if (b(GamepadButton.DpadUp)) y = 1;
      if (b(GamepadButton.DpadDown)) y = -1;
      if (Math.abs(x) > Math.abs(o.x)) o.x = x;
      if (Math.abs(y) > Math.abs(o.y)) o.y = y;
      const cx = deadzone(input.axis(port, GamepadAxis.RightX));
      const cy = -deadzone(input.axis(port, GamepadAxis.RightY));
      o.cx = Math.abs(cx) > 0.6 ? Math.sign(cx) : 0;
      o.cy = Math.abs(cy) > 0.6 ? Math.sign(cy) : 0;
      o.attack = o.attack || b(GamepadButton.South);
      o.special = o.special || b(GamepadButton.East);
      o.jump = o.jump || b(GamepadButton.West) || b(GamepadButton.North);
      o.grab = o.grab || b(GamepadButton.LeftShoulder) || b(GamepadButton.RightShoulder);
      o.shield = o.shield || b(GamepadButton.LeftTrigger) || b(GamepadButton.RightTrigger);
      o.taunt = o.taunt || b(GamepadButton.Back);
      // Tap jump: up on keyboard or stick also jumps.
      if (TAP_JUMP[port] && o.y >= 0.7) o.jump = true;
      return o;
    },
  };
}
