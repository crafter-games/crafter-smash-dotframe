// CPU controller, ported from js/ai.js.
import type { Fighter } from "./fighter";
import type { Game } from "./game";
import { type Controller, emptyInput, type RawInput } from "./input";
import { random, randi, sgn } from "./util";

interface InputPatch {
  x?: number;
  y?: number;
  attack?: boolean;
  special?: boolean;
  shield?: boolean;
  grab?: boolean;
  jump?: boolean;
}

interface Step {
  frames: number;
  input: InputPatch;
  // Aim the up special toward the ledge each frame instead of a fixed input.
  aim: boolean;
}

const chance = (p: number): boolean => random() < p;

function apply(out: RawInput, patch: InputPatch): void {
  if (patch.x !== undefined) out.x = patch.x;
  if (patch.y !== undefined) out.y = patch.y;
  if (patch.attack !== undefined) out.attack = patch.attack;
  if (patch.special !== undefined) out.special = patch.special;
  if (patch.shield !== undefined) out.shield = patch.shield;
  if (patch.grab !== undefined) out.grab = patch.grab;
  if (patch.jump !== undefined) out.jump = patch.jump;
}

const step = (frames: number, input: InputPatch): Step => ({ frames, input, aim: false });

function pickSteps(options: Step[][]): Step[] {
  return options[Math.floor(random() * options.length)];
}

function pickPatch(options: InputPatch[]): InputPatch {
  return options[Math.floor(random() * options.length)];
}

const STUN_STATES = new Set(["hitstun", "tumble", "grabbed", "ledge", "down", "dead"]);
const THINK_STATES = new Set(["idle", "walk", "dash", "run", "crouch", "air", "shield", "land"]);

// level 0 is the training dummy; dummy picks its behavior ("quieto", "escudo", "salta").
export function createCPUController(initialLevel: number): Controller & { setLevel: (level: number, dummy: string) => void } {
  let level = initialLevel;
  let dummy = "quieto";
  const queue: Step[] = [];
  let cool = 0;
  let ledgeWait = 0;
  const seq = (steps: Step[]): void => {
    for (const s of steps) queue.push({ frames: s.frames, input: s.input, aim: s.aim });
  };

  const recover = (me: Fighter, g: Game, out: RawInput, toCenter: number): void => {
    const st = g.stage;
    const L = me.x < (st.main.x1 + st.main.x2) / 2 ? st.ledges[0] : st.ledges[1];
    const below = me.y - L.y;
    const dxL = Math.abs(me.x - L.x);
    // Under the stage, first move outward so the stage does not block the climb.
    const tgtX = below > 40 ? L.x + L.side * 40 : (st.main.x1 + st.main.x2) / 2;
    out.x = sgn(tgtX - me.x) || toCenter;
    if (me.state === "air" || me.state === "tumble") {
      if (me.jumps > 0 && me.vy > -1 && (below > -30 || dxL > 220)) {
        seq([step(1, { jump: true, x: out.x }), step(8, { x: out.x, jump: true })]);
        return;
      }
      if (me.jumps === 0 && me.vy > 0 && (below > -60 || dxL > 140)) {
        seq([step(1, { special: true, y: 1 }), { frames: 60, input: {}, aim: true }]);
        return;
      }
      // Anthony floats when high.
      if (me.charId === "anthony" && me.vy > 0 && below < -40 && dxL < 200) out.jump = true;
    }
  };

  const think = (me: Fighter, g: Game, out: RawInput): void => {
    const lvl = level;
    let op: Fighter | null = null;
    for (const f of g.fighters) if (f !== me && f.state !== "dead") op = f;
    const st = g.stage;
    const m = st.main;
    const center = (m.x1 + m.x2) / 2;
    const toCenter = sgn(center - me.x) || 1;
    const s = me.state;
    const fr = g.frame;

    if (s === "grabbed" || s === "dizzy") {
      if (fr % 3 === 0) {
        out.attack = true;
        out.x = fr % 6 ? 1 : -1;
      }
      return;
    }
    if (s === "hitstun" || s === "tumble") {
      if (chance(lvl / 10)) {
        out.x = toCenter;
        out.y = me.kvy < -6 ? 0 : 1;
      }
      if (!me.ground && me.vy + me.kvy > 0 && chance(lvl * 0.06)) {
        for (const p of st.platforms) {
          if (me.x > p.x1 && me.x < p.x2 && p.y - me.y < 60 && p.y - me.y > 0) {
            out.shield = fr % 2 === 0;
            out.x = chance(0.5) ? (chance(0.5) ? -1 : 1) : 0;
          }
        }
      }
      if (s === "tumble") recover(me, g, out, toCenter);
      return;
    }
    if (s === "down") {
      if (me.sf > 14 + randi(0, 30 - lvl * 2)) seq([step(1, pickPatch([{ y: 1 }, { x: -1 }, { x: 1 }, { attack: true }])), step(2, {})]);
      return;
    }
    if (s === "ledge") {
      if (!ledgeWait) ledgeWait = randi(8, 50 - lvl * 3);
      if (me.sf >= ledgeWait) {
        ledgeWait = 0;
        const L = me.ledge;
        const inx = L ? -L.side : 1;
        seq([step(1, pickPatch([{ x: inx }, { jump: true }, { shield: true }, { attack: true }, { jump: true }])), step(4, {})]);
      }
      return;
    }
    if (!op) return;
    const offstage = !me.ground && (me.x < m.x1 - 5 || me.x > m.x2 + 5 || me.y > m.y + 5);
    if (offstage || s === "fall" || (me.state === "air" && me.y > m.y - 20 && (me.x < m.x1 + 20 || me.x > m.x2 - 20))) {
      recover(me, g, out, toCenter);
      return;
    }
    if (s === "respawn") {
      if (me.sf > 40) out.x = toCenter;
      return;
    }
    // Automatic L-cancel.
    const myMove = me.move;
    if (s === "attack" && myMove && myMove.aerial && me.vy > 0 && chance(lvl * 0.08)) {
      for (const p of st.platforms) if (me.x > p.x1 && me.x < p.x2 && p.y - me.y < 28 && p.y - me.y > 0) out.shield = true;
    }
    if (!THINK_STATES.has(s)) return;
    if (s === "shield") {
      if (chance(0.3)) seq([step(1, { shield: true, attack: true }), step(2, {})]);
      return;
    }
    if (cool > 0) {
      cool -= 1;
      out.x = me.ground && Math.abs(op.x - me.x) > 160 ? sgn(op.x - me.x) : 0;
      return;
    }

    const dx = op.x - me.x;
    const adx = Math.abs(dx);
    const dy = me.y - op.y;
    const face = sgn(dx) || me.facing;
    const opOff = !op.ground && (op.x < m.x1 - 10 || op.x > m.x2 + 10);
    const rail = me.charId === "railly";
    cool = randi(0, Math.max(0, (9 - lvl) * 4));

    if (me.meter >= 100 && adx < 350 && me.ground) {
      seq([step(1, { special: true }), step(3, {})]);
      return;
    }
    // Reactive shield.
    const opMove = op.move;
    if (me.ground && op.state === "attack" && opMove && !opMove.special && adx < 140 && op.sf < opMove.as && chance(lvl * 0.07)) {
      seq([step(randi(10, 20), { shield: true })]);
      if (chance(0.5)) seq([step(1, { shield: true, attack: true }), step(2, {})]);
      return;
    }
    // Edgeguard.
    if (opOff && lvl >= 4 && me.ground) {
      const L = op.x < center ? st.ledges[0] : st.ledges[1];
      const tx = L.x - L.side * 50;
      if (Math.abs(me.x - tx) > 30) {
        seq([step(6, { x: sgn(tx - me.x) })]);
        return;
      }
      if (Math.abs(op.x - me.x) < 170 && op.y > me.y - 40) {
        seq([step(1, { x: face, attack: true }), step(randi(0, 10), { attack: true }), step(10, {})]);
        return;
      }
      if (chance(0.3)) seq([step(1, { special: true, x: 0 }), step(16, {})]);
      return;
    }
    if (!me.ground) {
      if (adx < 90 && Math.abs(dy) < 90 && chance(0.5)) {
        const a: InputPatch = dy > 40 ? { y: 1, attack: true } : dy < -40 ? { y: -1, attack: true } : { x: dx * me.facing > 0 ? me.facing : -me.facing, attack: true };
        seq([step(1, a), step(3, {})]);
      } else out.x = face;
      return;
    }
    // Close range.
    if (adx < 95 && Math.abs(dy) < 70) {
      const opts: Step[][] = [];
      const weight = (n: number, steps: Step[]): void => {
        for (let i = 0; i < n; i++) opts.push(steps);
      };
      const turn: Step[] = me.facing !== face ? [step(1, { x: face * 0.5 })] : [];
      weight(2, [...turn, step(1, { attack: true }), step(4, {}), step(1, { attack: true }), step(6, {})]);
      weight(2, [step(1, { x: face * 0.5 }), step(1, { x: face * 0.5, attack: true }), step(12, {})]);
      weight(2, [step(1, { y: -0.6 }), step(1, { y: -0.6, attack: true }), step(10, {})]);
      weight(op.state === "shield" ? 6 : 2, [...turn, step(1, { grab: true }), step(14, {})]);
      weight(op.percent > 90 ? 4 : 1, [step(1, { x: face, attack: true }), step(randi(0, 25), { attack: true }), step(16, {})]);
      weight(1, [step(1, { y: 1, attack: true }), step(randi(0, 15), { attack: true }), step(16, {})]);
      weight(1, [step(1, { y: -1, attack: true }), step(12, {})]);
      if (rail) weight(2, [step(1, { y: -1, special: true }), step(5, {}), step(1, { jump: true }), step(2, {}), step(1, { shield: true, x: face, y: -1 }), step(8, {})]);
      else weight(1, [step(1, { x: face, special: true }), step(24, {})]);
      if (lvl >= 6 && rail) weight(1, [step(1, { jump: true }), step(3, {}), step(1, { attack: true }), step(16, {})]);
      seq(pickSteps(opts));
      return;
    }
    // Opponent above.
    if (dy > 70 && adx < 90) {
      seq(
        pickSteps([
          [step(1, { y: 1, attack: true }), step(randi(0, 10), { attack: true }), step(16, {})],
          [step(1, { y: 0.6 }), step(1, { y: 0.6, attack: true }), step(12, {})],
          [step(1, { jump: true }), step(6, { jump: true }), step(1, { y: 1, attack: true }), step(22, {})],
        ]),
      );
      return;
    }
    // Mid range.
    if (adx < 260) {
      const opts: Step[][] = [
        [step(6, { x: face })],
        [step(1, { jump: true, x: face }), step(3, { x: face }), step(1, { attack: true, x: face }), step(20, { x: face * 0.3 })],
        [step(1, { jump: true, x: face }), step(8, { x: face }), step(1, { attack: true, y: -1 }), step(3, {}), step(10, { y: -1 })],
        [step(5, { x: -face }), step(5, { x: face }), step(5, { x: -face })],
      ];
      if (lvl >= 5) opts.push([step(1, { jump: true }), step(me.stats.jumpsquat - 1, {}), step(1, { shield: true, x: face, y: -1 }), step(10, {})]);
      if (!rail && chance(0.3)) opts.push([step(1, { x: face, special: true }), step(30, {})]);
      seq(pickSteps(opts));
      return;
    }
    // Far.
    if (chance(rail ? 0.35 : 0.25)) {
      if (me.facing !== face) seq([step(1, { x: face * 0.5 })]);
      if (rail) seq([step(1, { jump: true }), step(2, {}), step(1, { special: true }), step(16, {})]);
      else seq([step(1, { special: true }), step(randi(0, 40), { special: true }), step(20, {})]);
      return;
    }
    seq([step(randi(8, 20), { x: face })]);
  };

  return {
    isCPU: true,
    setLevel: (value: number, mode: string): void => {
      level = value;
      dummy = mode;
    },
    read: (me: Fighter, g: Game): RawInput => {
      const out = emptyInput();
      if (level === 0) {
        if (dummy === "escudo" && me.state !== "hitstun") out.shield = true;
        if (dummy === "salta" && g.frame % 50 < 2) out.jump = true;
        return out;
      }
      if (queue.length > 0) {
        const s = queue[0];
        if (s.aim) {
          const st = g.stage;
          const L = me.x < (st.main.x1 + st.main.x2) / 2 ? st.ledges[0] : st.ledges[1];
          const tx = L.x + L.side * 34;
          const ty = L.y - 20;
          const vx = tx - me.x;
          const vy = me.y - ty;
          const mm = Math.hypot(vx, vy) || 1;
          out.x = vx / mm;
          out.y = vy / mm;
        } else apply(out, s.input);
        s.frames -= 1;
        if (s.frames <= 0) queue.shift();
        // Drop the plan when hit.
        if (STUN_STATES.has(me.state)) queue.length = 0;
        return out;
      }
      think(me, g, out);
      return out;
    },
  };
}
