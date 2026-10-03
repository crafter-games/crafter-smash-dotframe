// Rollback netplay for two peers. Each peer simulates every frame immediately, predicting the remote input
// as "same as the last one seen". When the real input arrives and differs, it restores the snapshot taken
// before that frame and re-simulates up to the present with sound muted. Local input is delayed a couple of
// frames to hide most of the latency, so rollbacks stay short.
import type { Rollback, RollbackOptions, RollbackStats } from "./net-types";
import { NEUTRAL_INPUT } from "./netinput";
import { checksum, createSnapshotter, type Snapshot, type Snapshotter } from "./snapshot";
import { soundGate } from "./sound";

const SUM_EVERY = 30;
// Inputs resent with every message so a late peer catches up without acknowledgments.
const RESEND = 8;

export function createRollback(options: RollbackOptions): Rollback {
  const { game, transport, localPort, slots, inputDelay, maxRollback } = options;
  const remotePort = 1 - localPort;
  const snapshotter: Snapshotter = createSnapshotter(game);
  const local: number[] = [];
  const remote: number[] = [];
  // Remote input each simulated frame actually used, to detect mispredictions.
  const used: number[] = [];
  const snapshots: (Snapshot | null)[] = [];
  const sums: number[] = [];
  const peerSums = new Map<number, number>();
  let frame = 0;
  // Every remote input below this frame is known.
  let confirmed = 0;
  let peerNow = 0;
  let sentSums = 0;
  const stats: RollbackStats = { frame: 0, rollbacks: 0, longestRollback: 0, stalls: 0, desync: -1 };

  for (let f = 0; f < inputDelay; f++) {
    local[f] = NEUTRAL_INPUT;
    remote[f] = NEUTRAL_INPUT;
  }
  confirmed = inputDelay;

  const remoteFor = (f: number): number => {
    if (f < confirmed) return remote[f];
    return confirmed > 0 ? remote[confirmed - 1] : NEUTRAL_INPUT;
  };

  const simulate = (f: number): void => {
    snapshots[f] = snapshotter.save();
    slots[localPort] = local[f] ?? NEUTRAL_INPUT;
    const r = remoteFor(f);
    slots[remotePort] = r;
    used[f] = r;
    game.step();
    sums[f] = checksum(game);
    // Old snapshots are never rolled back to.
    const drop = f - maxRollback - 2;
    if (drop >= 0) snapshots[drop] = null;
  };

  const compareSums = (): void => {
    for (const [f, sum] of peerSums) {
      if (f >= confirmed || f >= frame) continue;
      if (sums[f] !== sum && stats.desync < 0) stats.desync = f;
      peerSums.delete(f);
    }
  };

  const settle = (): void => {
    let rollbackTo = frame;
    for (const message of transport.receive()) {
      if (message.t === "sum") {
        peerSums.set(message.frame, message.sum);
        continue;
      }
      peerNow = Math.max(peerNow, message.now);
      for (let i = 0; i < message.inputs.length; i++) {
        const f = message.from + i;
        if (f < confirmed) continue;
        if (f !== confirmed) break;
        remote[f] = message.inputs[i];
        confirmed = f + 1;
        if (f < frame && used[f] !== remote[f] && f < rollbackTo) rollbackTo = f;
      }
    }
    // Inputs after the last confirmed one were predicted as that one; a new confirmation can change them too.
    for (let f = rollbackTo; f < Math.min(frame, confirmed); f++) {
      if (used[f] !== remote[f]) {
        rollbackTo = f;
        break;
      }
    }
    for (let f = confirmed; f < frame && rollbackTo === frame; f++) if (used[f] !== remoteFor(f)) rollbackTo = f;

    if (rollbackTo < frame) {
      const snapshot = snapshots[rollbackTo];
      if (snapshot) {
        stats.rollbacks += 1;
        stats.longestRollback = Math.max(stats.longestRollback, frame - rollbackTo);
        snapshotter.restore(snapshot);
        soundGate.muted = true;
        for (let f = rollbackTo; f < frame; f++) simulate(f);
        soundGate.muted = false;
      }
    }
  };

  const tick = (localInput: number): boolean => {
    settle();
    // Wait rather than predict too far, or run ahead of a slower peer.
    if (frame - confirmed >= maxRollback || frame > peerNow + inputDelay + 1) {
      stats.stalls += 1;
      transport.send({ t: "input", now: frame, from: Math.max(0, frame + inputDelay - RESEND), inputs: local.slice(Math.max(0, frame + inputDelay - RESEND), frame + inputDelay) });
      return false;
    }

    local[frame + inputDelay] = localInput;
    const from = Math.max(0, frame + inputDelay + 1 - RESEND);
    transport.send({ t: "input", now: frame, from, inputs: local.slice(from, frame + inputDelay + 1) });
    simulate(frame);
    frame += 1;

    while (sentSums + SUM_EVERY < confirmed && sentSums + SUM_EVERY < frame) {
      sentSums += SUM_EVERY;
      transport.send({ t: "sum", frame: sentSums, sum: sums[sentSums] });
    }
    compareSums();
    stats.frame = frame;
    return true;
  };

  return { tick, settle, confirmedFrame: (): number => Math.min(confirmed, frame), stats: (): RollbackStats => stats };
}
