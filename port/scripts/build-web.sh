#!/bin/sh
# Builds the web version of the match into port/dist/web. Serve that directory over HTTP.
set -e
port_dir=$(cd "$(dirname "$0")/.." && pwd)
repo=$(cd "$port_dir/.." && pwd)
dotframe=${DOTFRAME:-$(cd "$repo/vendor/dotframe" && pwd)}
out="$port_dir/dist/web"
rm -rf "$out"
mkdir -p "$out/assets" "$out/port" "$out/dotframe/assets"
bun build "$port_dir/match/main.web.ts" --outfile "$out/main.js" --target browser --minify
# Content-hashed bundle name: Discord's proxy and browsers cache main.js, and a new name per build means a new
# version is never served from a stale cache.
hash=$(shasum -a 256 "$out/main.js" | cut -c1-10)
mv "$out/main.js" "$out/main.$hash.js"
sed "s#./main.js#./main.$hash.js#" "$port_dir/match/index.html" > "$out/index.html"
# The page itself is never cached, so it always points at the current bundle.
cp "$port_dir/match/vercel.json" "$out/"
cp -R "$repo/assets/sprites" "$repo/assets/items" "$repo/assets/music" "$out/assets/"
cp -R "$port_dir/assets" "$out/port/"
cp -R "$dotframe/assets/fonts" "$out/dotframe/assets/"
du -sh "$out" | cut -f1
