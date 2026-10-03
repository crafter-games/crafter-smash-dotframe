// Netplay types shared by the menu (all targets) and the web-only rollback and relay modules.
import type { Game } from "./game";

export interface InputMessage {
  t: "input";
  // The sender's current frame, and the latest `now` it has received from us (an echo, to measure the round trip).
  now: number;
  ack: number;
  // Consecutive inputs starting at frame `from`.
  from: number;
  inputs: number[];
}

export interface SumMessage {
  t: "sum";
  frame: number;
  sum: number;
}

export type NetMessage = InputMessage | SumMessage;

export interface Transport {
  send: (message: NetMessage) => void;
  // Messages received since the last call, in order.
  receive: () => NetMessage[];
}

export interface RollbackOptions {
  game: Game;
  transport: Transport;
  // 0 or 1: which fighter this peer controls.
  localPort: number;
  // Encoded inputs each port's controller reads on the next step.
  slots: number[];
  inputDelay: number;
  // Past this many unconfirmed frames the peer waits instead of predicting further.
  maxRollback: number;
}

export interface RollbackStats {
  frame: number;
  rollbacks: number;
  longestRollback: number;
  stalls: number;
  desync: number;
  // Smoothed round trip and lead over the peer, in frames.
  rtt: number;
  ahead: number;
  // Time spent in the last tick (rollback, re-simulation and the new frame), in ms.
  tickMs: number;
}

export interface Rollback {
  // One display tick: sends local input, applies remote input, rolls back if needed, then advances a frame
  // unless too far ahead of the peer. Returns whether a frame was simulated.
  tick: (localInput: number) => boolean;
  // Applies received input and rolls back without advancing.
  settle: () => void;
  // Highest frame below which both peers' inputs are known (the state there is final).
  confirmedFrame: () => number;
  stats: () => RollbackStats;
}

export interface StartMessage {
  t: "start";
  seed: number;
  chars: string[];
  stage: string;
  stocks: number;
}

export interface PickMessage {
  t: "pick";
  char: string;
}

export interface UnpickMessage {
  t: "unpick";
}

export type LobbyMessage = PickMessage | UnpickMessage | StartMessage;

export interface OnlineLink {
  room: string;
  // "connecting", "waiting" (alone in the room), "paired", "closed".
  status: () => string;
  // 0 hosts (chooses stage, seed and stocks), 1 joins; -1 before the relay answers.
  slot: () => number;
  sendLobby: (message: LobbyMessage) => void;
  receiveLobby: () => LobbyMessage[];
  transport: Transport;
  close: () => void;
}

// What a platform with netplay hands the menu.
export interface Netplay {
  connect: () => OnlineLink;
  createRollback: (options: RollbackOptions) => Rollback;
}
