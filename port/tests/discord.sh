#!/bin/sh
# Checks the Discord Activity entry with a simulated Discord RPC (tests/discord-sim.js), then without it.
# Needs agent-browser and a built port/dist/web (scripts/build-web.sh).
set -e
here=$(cd "$(dirname "$0")" && pwd)
log=$(mktemp)
(cd "$here/../dist/web" && bunx serve . > "$log" 2>&1) &
server=$!
trap 'kill $server 2>/dev/null; agent-browser --session discord-sim close >/dev/null 2>&1 || true; agent-browser --session discord-none close >/dev/null 2>&1 || true' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10; do grep -q "Accepting connections" "$log" && break; sleep 1; done
port=$(grep -oE "localhost:[0-9]+" "$log" | head -1 | cut -d: -f2)
url="http://localhost:$port/?frame_id=fixture&instance_id=test&platform=desktop&client_id=111111111111111111"
state='JSON.stringify({handshake: document.documentElement.dataset.handshake ?? null, webgpu: document.documentElement.dataset.webgpu ?? null, canvas: !!document.querySelector("canvas"), text: document.body.innerText.slice(0, 80)})'

agent-browser --session discord-sim --headed --init-script "$here/discord-sim.js" --args "--enable-unsafe-webgpu" open "$url" >/dev/null
sleep 12
with=$(agent-browser --session discord-sim eval "$state" | tail -1)
echo "with simulated Discord: $with"
echo "$with" | grep -q 'handshake\\":\\"ready' && echo "$with" | grep -q 'canvas\\":true' || { echo "FAIL: expected handshake and a running game"; exit 1; }

agent-browser --session discord-none --headed --args "--enable-unsafe-webgpu" open "$url" >/dev/null
sleep 23
without=$(agent-browser --session discord-none eval "$state" | tail -1)
echo "without Discord: $without"
echo "$without" | grep -q "Discord no respondió" || { echo "FAIL: expected the timeout message"; exit 1; }
echo "discord activity entry OK"
