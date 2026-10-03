// Async asset loaders for the web and desktop entries. Kept apart from the modules they fill so the iOS library
// build, which cannot reach promises, does not import them.
import type { Audio } from "../../vendor/dotframe/src/audio";
import type { Gpu } from "../../vendor/dotframe/src/gpu";
import { itemIsSmooth, setItem } from "./items";
import { registerSound, registerTrack } from "./sound";
import { setAtlas } from "./sprites";

export async function loadSound(audio: Audio, name: string, mp3: Uint8Array): Promise<void> {
  registerSound(name, await audio.loadSound(mp3));
}

export async function loadTrack(audio: Audio, name: string, mp3: Uint8Array): Promise<void> {
  registerTrack(name, await audio.loadMusic(mp3));
}

export async function loadAtlas(gpu: Gpu, key: string, png: Uint8Array, face: boolean): Promise<void> {
  setAtlas(key, await gpu.createImage(png, false), face);
}

export async function loadItem(gpu: Gpu, name: string, png: Uint8Array): Promise<void> {
  setItem(name, await gpu.createImage(png, itemIsSmooth(name)));
}
