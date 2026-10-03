import { expect, test } from "bun:test";
import { type Input, keyCodes, type Pointer, type Touch } from "../../vendor/dotframe/src/input";
import { createMenu } from "../src/menu";
import { headless } from "./harness";

// Keyboard-only Input whose held keys the test sets by code.
function keyboard(): { input: Input; hold: (codes: string[]) => void } {
  let held: number[] = [];
  const input: Input = {
    down: (key: number): boolean => held.indexOf(key) >= 0,
    firstDown: (): number => (held.length > 0 ? held[0] : -1),
    axis: (): number => 0,
    button: (): boolean => false,
    pointer: (): Pointer => ({ x: 0, y: 0, buttons: 0 }),
    touches: (): Touch[] => [],
  };
  return { input, hold: (codes: string[]): void => { held = codes.map((c: string): number => keyCodes.indexOf(c)); } };
}

test("1P vs CPU from the title screen reaches a running match", () => {
  const { game } = headless();
  const { input, hold } = keyboard();
  const menu = createMenu({ game, input, width: 1280, height: 720, modes: ["cpu", "2p", "training"], touch: null, netplay: null });
  const press = (code: string): void => {
    hold([code]);
    menu.step();
    hold([]);
    menu.step();
  };
  press("Enter"); // title: 1P vs CPU
  press("KeyF"); // select: P1 picks, CPU is already chosen
  press("Enter"); // start
  expect(game.running).toBe(true);
  for (let i = 0; i < 240; i++) menu.step();
  expect(game.frame).toBeGreaterThan(200);
  expect(game.phase).toBe("play");
});
