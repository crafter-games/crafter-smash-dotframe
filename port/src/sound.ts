// Melee sound effects and announcer plus music, ported from js/audio.js onto dotframe's Audio.
import type { AudioPlayer } from "../../vendor/dotframe/src/audio";
import { rand } from "./util";

const MUSIC_VOLUME = 0.45;

let audio: AudioPlayer | null = null;
const sounds = new Map<string, number>();
const tracks = new Map<string, number>();
let musicOn = true;
let musicName = "";

export function initSound(platformAudio: AudioPlayer): void {
  audio = platformAudio;
  platformAudio.setMasterVolume(0.8);
}

export function registerSound(name: string, id: number): void {
  sounds.set(name, id);
}

export function registerTrack(name: string, id: number): void {
  tracks.set(name, id);
}

export function play(name: string, volume: number, rate: number): void {
  const a = audio;
  const sound = sounds.get(name);
  if (a && sound !== undefined) a.play(sound, volume, rate);
}

function tone(frequency: number, duration: number, volume: number): void {
  const a = audio;
  if (a) a.tone(frequency, duration, volume);
}

export const sfx = {
  hit: (power: number, type: string): void => {
    if (type === "fire") {
      play(power < 0.8 ? "fireS" : power < 1.8 ? "fireM" : "fireL", 0.9, 1);
      return;
    }
    if (type === "flash" || type === "beam" || type === "shine") {
      play(power < 1.5 ? "elec" : "hitLarge", 0.9, 1);
      return;
    }
    if (power < 0.45) play("hitWeak", 0.8, rand(0.95, 1.05));
    else if (power < 1) play("hitSmall", 0.9, rand(0.95, 1.05));
    else if (power < 1.8) play("hitMed", 1, 1);
    else {
      play("hitLarge", 1, 1);
      if (power > 2.4) play("homerun", 0.6, 1);
    }
  },
  whiff: (): void => play(Math.random() < 0.5 ? "swing1" : "swing2", 0.5, rand(0.9, 1.1)),
  heavyWhiff: (): void => play("heavySwing", 0.5, 1),
  shield: (): void => play("clang", 0.45, 1.2),
  shieldUp: (): void => play("shieldUp", 0.4, 1),
  parry: (): void => play("powershield", 1, 1),
  shieldBreak: (): void => play("shieldBreak", 1, 1),
  jump: (): void => play("jump", 0.6, 1),
  djump: (): void => play("jump", 0.6, 1.15),
  land: (): void => play("land", 0.5, 1),
  dash: (): void => play("dash", 0.5, 1),
  airdodge: (): void => play("spotdodge", 0.6, 1),
  roll: (): void => play("roll", 0.6, 1),
  wavedash: (): void => play("dash", 0.5, 1.2),
  lcancel: (): void => tone(1760, 0.05, 0.05),
  tech: (): void => play("tech", 0.8, 1),
  ledge: (): void => play("tech", 0.6, 0.9),
  fastfall: (): void => play("fastfall", 0.5, 1),
  laser: (): void => play("rayGun", 0.55, rand(1.0, 1.1)),
  beam: (): void => play("beamSword", 0.9, 1),
  shine: (): void => play("reflect", 0.7, 1.3),
  reflect: (): void => play("reflect", 0.9, 1),
  fire: (): void => play("fireM", 0.5, 1.2),
  peace: (): void => play("starRod", 0.8, 1),
  counter: (): void => {
    play("powershield", 1, 1);
    play("elec", 0.7, 1);
  },
  grab: (): void => play("grab", 0.8, 1),
  grabMiss: (): void => play("grabMiss", 0.5, 1),
  throw: (): void => play("heavySwing", 0.7, 1),
  ko: (bottom: boolean): void => play(bottom ? "blastBottom" : "blastSide", 1, 1),
  starKO: (): void => play("starKO", 1, 1),
  charge: (): void => play("charge", 0.5, 1),
  smashReady: (): void => play("coin", 0.9, 1),
  final: (): void => {
    play("appear", 1, 1);
    play("explosion", 0.6, 1);
  },
  fatal: (): void => play("homerun", 1, 1),
  select: (): void => play("menuEnter", 0.8, 1),
  move: (): void => play("menuScroll", 0.6, 1),
  back: (): void => play("menuBack", 0.7, 1),
  pause: (): void => play("pause", 0.8, 1),
  medallion: (): void => play("medallion", 0.8, 1),
  taunt: (): void => play("medallion", 0.55, 1.15),
  results: (): void => play("results", 0.8, 1),
  appear: (): void => play("appear", 0.7, 1),
  explosion: (): void => play("explosion", 0.9, 1),
};

// Announcer: 'three', 'two', 'one', 'go', 'game', 'winnerIs', 'choose', 'name_railly', ...
export function voice(key: string, volume: number): void {
  play(key, volume, 1);
}

// Synthesized speech (Shiara's swears). No native text-to-speech yet, so this is silent.
export function say(_text: string, _pitch: number): void {}

export function playMusic(name: string, force: boolean): void {
  const a = audio;
  if (!a) return;
  if (musicName === name && !force) return;
  musicName = name;
  const track = tracks.get(name);
  if (name === "" || track === undefined) {
    a.stopMusic();
    return;
  }
  a.playMusic(track, !name.startsWith("victory"), musicOn ? MUSIC_VOLUME : 0);
}

export function stopMusic(): void {
  const a = audio;
  if (a) a.stopMusic();
  musicName = "";
}

export function toggleMusic(): boolean {
  musicOn = !musicOn;
  const a = audio;
  if (a) a.setMusicVolume(musicOn ? MUSIC_VOLUME : 0);
  return musicOn;
}

export function duckMusic(volume: number): void {
  const a = audio;
  if (a && musicOn) a.setMusicVolume(MUSIC_VOLUME * volume);
}

export const isMusicOn = (): boolean => musicOn;
