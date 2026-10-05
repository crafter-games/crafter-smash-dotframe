// Summons and thrown items shared by special moves: Pokémon, Miku and Kirby. Ported from js/characters.js.
import type { Draw2D } from "../../vendor/dotframe/src/draw2d";
import type { Fighter } from "./fighter";
import type { Game, Projectile } from "./game";
import { drawItem } from "./items";
import { play, sfx } from "./sound";
import { H } from "./types";
import { rand, random, sgn, TAU } from "./util";
import { dsin } from "../../vendor/dotframe/src/detmath";

export const pick = (values: string[]): string => values[Math.floor(random() * values.length)];

interface Pokemon {
  img: string;
  name: string;
  color: string;
}

const POKEMON: Pokemon[] = [
  { img: "pikachu", name: "¡Pikachu, Impactrueno!", color: "#ffe23f" },
  { img: "charmander", name: "¡Charmander, Lanzallamas!", color: "#ff8c1a" },
  { img: "squirtle", name: "¡Squirtle, Pistola Agua!", color: "#5ec8ff" },
  { img: "bulbasaur", name: "¡Bulbasaur, Látigo Cepa!", color: "#7ed957" },
];

export function summonPokemon(owner: Fighter, x: number, y: number, g: Game, facing: number): void {
  if (g.countProjs(owner, "pokemon") > 0) return;
  const P = POKEMON[Math.floor(random() * POKEMON.length)];
  sfx.appear();
  g.fx.text(x, y - 70, P.name, P.color, 20, { life: 60, max: 60 });
  g.fx.shockwave(x, y, "#fff", 60);
  g.spawnProjectile(owner, {
    kind: "pokemon",
    entity: true,
    type: "img",
    img: P.img,
    x,
    y,
    vx: 0,
    vy: 0,
    life: 70,
    h: 54,
    flip: facing > 0,
    grav: 0.6,
    roll: true,
    r: 0,
    update: (p: Projectile, gg: Game): void => {
      const t = p.t;
      if (P.img === "pikachu" && (t === 22 || t === 36)) {
        sfx.hit(1.2, "flash");
        gg.flash("#fff6a0", 0.35);
        gg.zone(owner, p.x, p.y - 40, 75, { d: 5, a: 75, b: 45, k: 60, fx: "flash" }, 2);
        for (let i = 0; i < 8; i++) {
          gg.fx.p({ x: p.x + rand(-20, 20), y: p.y - 260 + i * 30, vx: rand(-3, 3), vy: 6, life: 10, size: 5, color: i % 2 ? "#fff" : "#ffe23f", kind: "line" });
        }
      }
      if (P.img === "charmander" && t > 18 && t < 50) {
        if (t % 2 === 0) gg.fx.fire(p.x + facing * rand(20, 140), p.y - 22 + rand(-12, 12), 2);
        if (t % 8 === 0) gg.zone(owner, p.x + facing * 80, p.y - 22, 60, { d: 2.5, a: 40, b: 0, k: 0, fkb: 30, fx: "fire", dir: facing }, 2);
        if (t === 46) gg.zone(owner, p.x + facing * 80, p.y - 22, 64, { d: 5, a: 40, b: 50, k: 70, fx: "fire", dir: facing }, 2);
        if (t === 20) sfx.fire();
      }
      if (P.img === "squirtle" && t === 22) {
        sfx.reflect();
        gg.spawnProjectile(owner, {
          type: "img",
          img: "kirby_ball0",
          draw: (ctx: Draw2D, q: Projectile, g3: Game): void => {
            ctx.save();
            ctx.setFillStyle("rgba(120,200,255,.85)");
            ctx.setStrokeStyle("#fff");
            ctx.setLineWidth(3);
            ctx.beginPath();
            ctx.ellipse(q.x, q.y, 22, 14, 0, 0, TAU, false);
            ctx.fill();
            ctx.stroke();
            ctx.setFillStyle("rgba(255,255,255,.7)");
            ctx.beginPath();
            ctx.arc(q.x - 6, q.y - 4, 5, 0, TAU, false);
            ctx.fill();
            ctx.restore();
            if (q.t % 2 === 0) g3.fx.p({ x: q.x - sgn(q.vx) * 20, y: q.y, vx: -q.vx * 0.2, vy: rand(-1, 1), life: 14, size: 5, color: "#9fe0ff", kind: "puff" });
          },
          x: p.x + facing * 30,
          y: p.y - 24,
          vx: facing * 12,
          vy: 0,
          life: 45,
          r: 18,
          d: 4,
          a: 10,
          b: 0,
          k: 0,
          fkb: 75,
        });
      }
      if (P.img === "bulbasaur" && t === 24) {
        sfx.hit(0.8, "");
        gg.zone(owner, p.x + facing * 60, p.y - 30, 70, { d: 9, a: 50, b: 45, k: 75, dir: facing }, 3);
        for (let i = 0; i < 12; i++) gg.fx.p({ x: p.x + facing * i * 10, y: p.y - 30 - dsin(i / 2) * 20, vx: 0, vy: 0, life: 12, size: 5, color: "#4caf50", kind: "dot" });
      }
      if (t > 60) p.alpha = (70 - t) / 10;
    },
    draw: (ctx: Draw2D, p: Projectile, _gg: Game): void => {
      drawItem(ctx, p.img, p.x, p.y + 1, p.h, { flip: p.flip, anchorBottom: true, alpha: p.alpha });
    },
  });
}

export function spawnMiku(owner: Fighter, g: Game, big: boolean): void {
  sfx.appear();
  const f = owner;
  const main = g.stage.main;
  const x = big ? (main.x1 + main.x2) / 2 : f.x - f.facing * 50;
  const y = big ? main.y : f.y;
  g.fx.text(x, y - (big ? 360 : 150), big ? "♪ MIKU MIKU BEAM ♪" : "♪ ¡Miku! ♪", "#39c5bb", big ? 40 : 24, { life: 70, max: 70 });
  g.spawnProjectile(owner, {
    kind: "miku",
    entity: true,
    x,
    y,
    vx: 0,
    vy: 0,
    life: big ? 200 : 150,
    r: 30,
    update: (p: Projectile, gg: Game): void => {
      const every = big ? 14 : 20;
      if (p.t > 10 && p.t % every === 0) {
        const alternate = (p.t / every) % 2 ? 1 : -1;
        const dir = big ? alternate : alternate * f.facing;
        play("starRod", 0.35, 1.2 + Math.random() * 0.4);
        gg.spawnProjectile(owner, {
          type: "note",
          glyph: pick(["♪", "♫", "♬"]),
          x: p.x + dir * 30,
          y: p.y - (big ? 200 : 90) + rand(-30, 30),
          vx: dir * (big ? 9 : 6),
          vy: 0,
          wave: true,
          life: big ? 110 : 70,
          r: big ? 20 : 13,
          d: big ? 5 : 3,
          a: 55,
          b: big ? 40 : 0,
          k: big ? 45 : 0,
          fkb: big ? 0 : 34,
          color: pick(["#39c5bb", "#e12885", "#86cecb"]),
          noReflect: false,
        });
      }
      if (big && p.t === 180) {
        gg.flash("#39c5bb", 0.6);
        gg.shake(14);
        sfx.explosion();
        for (const t of gg.fighters) {
          if (t !== owner && t.state !== "dead") {
            gg.resolveHit(owner, t, H(0, 0, 0, 0, 0, 15, 60, 95, 75, { noStale: true, unblockable: true, fx: "flash" }), p.x, sgn(t.x - p.x) || 1, null, false);
          }
        }
      }
      if (p.life < 15) p.alpha = p.life / 15;
    },
    // The original's radial glow behind Miku is approximated with a translucent ellipse.
    draw: (ctx: Draw2D, p: Projectile, gg: Game): void => {
      const frame = `miku${Math.floor(gg.frame / 6) % 7}`;
      const h = big ? 330 : 130;
      ctx.save();
      if (p.t < 10) ctx.setGlobalAlpha(p.t / 10);
      ctx.setFillStyle("rgba(57,197,187,.18)");
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - h * 0.5, h * 0.7, h * 0.7, 0, 0, TAU, false);
      ctx.fill();
      drawItem(ctx, frame, p.x, p.y + 4, h, { anchorBottom: true, flip: big ? false : f.facing < 0, alpha: p.alpha });
      ctx.restore();
    },
  });
}

export function throwKirby(f: Fighter, g: Game): void {
  g.spawnProjectile(f, {
    kind: "kirby",
    type: "img",
    img: pick(["kirby", "kirby_happy"]),
    h: 34,
    x: f.x + f.facing * 40,
    y: f.y - 80,
    vx: f.facing * 7.5,
    vy: -6.5,
    grav: 0.42,
    bounce: 2,
    spin: f.facing * 0.25,
    life: 120,
    r: 16,
    d: 6,
    a: 50,
    b: 30,
    k: 58,
    onEnd: (p: Projectile, gg: Game): void => gg.fx.dustColored(p.x, p.y, 0, 5, "#ffc2dc"),
  });
}

export const SWEARS: string[][] = [
  ["¡CHANFLES!", "#ffd23f"],
  ["¡PIPIPI!", "#ff8ac8"],
  ["¡RAYOS!", "#7cf6ff"],
];
