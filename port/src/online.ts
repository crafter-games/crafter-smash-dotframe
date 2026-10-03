// One WebSocket to the relay, split into lobby messages (for the menu) and netplay messages (for rollback).
import type { LobbyMessage, NetMessage, OnlineLink } from "./net-types";

export function connectOnline(url: string, room: string): OnlineLink {
  const socket = new WebSocket(`${url}${url.includes("?") ? "&" : "?"}room=${encodeURIComponent(room)}`);
  let status = "connecting";
  let slot = -1;
  const lobby: LobbyMessage[] = [];
  const net: NetMessage[] = [];
  socket.onmessage = (event: MessageEvent): void => {
    const message = JSON.parse(String(event.data)) as { t: string; slot?: number; here?: boolean };
    if (message.t === "hello") {
      slot = message.slot ?? -1;
      status = "waiting";
    } else if (message.t === "peer") {
      status = message.here ? "paired" : "waiting";
      // A peer leaving mid-lobby or mid-match drops whatever was in flight.
      if (!message.here) net.length = 0;
    } else if (message.t === "input" || message.t === "sum") net.push(message as unknown as NetMessage);
    else lobby.push(message as unknown as LobbyMessage);
  };
  socket.onclose = (): void => {
    status = "closed";
  };
  const send = (message: object): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };
  return {
    room,
    status: (): string => status,
    slot: (): number => slot,
    sendLobby: (message: LobbyMessage): void => send(message),
    receiveLobby: (): LobbyMessage[] => lobby.splice(0, lobby.length),
    transport: {
      send: (message: NetMessage): void => send(message),
      receive: (): NetMessage[] => net.splice(0, net.length),
    },
    close: (): void => socket.close(),
  };
}
