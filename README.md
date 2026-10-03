# Crafter Smash (dotframe)

Crafter Smash ported to [dotframe](https://github.com/crafter-games/dotframe): one TypeScript codebase for the web (WebGPU), native macOS and Windows binaries, iOS, and Discord Activities.

The original Canvas2D game by Jibaru lives at [crafter-games/crafter-smash](https://github.com/crafter-games/crafter-smash). This repo keeps its history and assets, with the port under `port/`.

## Setup

```sh
git clone --recursive https://github.com/crafter-games/crafter-smash-dotframe
cd crafter-smash-dotframe/port
bun install
```

## Web

```sh
sh port/scripts/build-web.sh   # writes port/dist/web
bunx serve port/dist/web
```

Opens on the title menu. `?chars=railly,shiara&stage=lima&human=1` jumps straight into a match.

## iOS

Needs the iOS builds of SDL3 and wgpu-native under `vendor/dotframe/vendor/` (see dotframe), Xcode and xcodegen.

```sh
cd port
bun ../vendor/dotframe/tools/gen-library-glue.ts ios/app.json ios/build
(cd ios/build && SCRIPTC_TARGET=aarch64-apple-ios scriptc build --lib --profile smash.profile.json)
(cd ios && xcodegen generate && xcodebuild -scheme CrafterSmash -destination 'generic/platform=iOS' -allowProvisioningUpdates build)
```
