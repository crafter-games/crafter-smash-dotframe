// Normalizes js/spritedata.js into port/assets/sprite-data.json: arrays instead of index-keyed objects, no optional fields.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "..", "js", "spritedata.js"), "utf8") + ";globalThis.__D = SPRITE_DATA;", ctx);
const characters = Object.entries(ctx.__D).map(([id, data]) => {
  const keys = Object.keys(data.frames);
  const numeric = keys.filter((k) => /^\d+$/.test(k)).map(Number);
  const frames = [];
  for (let i = 0; i <= Math.max(...numeric); i++) frames.push(data.frames[i] || []);
  // Named frames (Anthony's push-ups) go after the numbered ones; animations refer to them by name.
  const named = new Map();
  for (const key of keys.filter((k) => !/^\d+$/.test(k))) {
    named.set(key, frames.length);
    frames.push(data.frames[key]);
  }
  const index = (ref) => {
    if (typeof ref === "number") return ref;
    if (named.has(ref)) return named.get(ref);
    throw new Error(`${id}: unknown frame ${ref}`);
  };
  const anims = Object.entries(data.anims).map(([name, a]) => ({ name, f: a.f.map(index), loop: a.loop || 0, hit: a.hit ?? -1, flip: !!a.flip }));
  if (frames.length === 0) throw new Error(`${id}: no frames`);
  return { id, idleH: data.idleH, frames, anims };
});
fs.writeFileSync(path.join(__dirname, "..", "assets", "sprite-data.json"), JSON.stringify({ characters }));
console.log(characters.map((c) => `${c.id}: ${c.frames.length} frames, ${c.anims.length} anims`).join("; "));
