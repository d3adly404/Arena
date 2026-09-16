#!/usr/bin/env bash
# usage: ./tools/build.sh [linux|windows|all]
set -e
cd "$(dirname "$0")/.."
SRC="src/core.c src/art.c src/particles.c src/projectiles.c src/world.c src/rooms.c src/player.c src/entities.c src/bosses.c src/ui.c src/game.c src/audio.c"
MODE="${1:-linux}"
if [ "$MODE" = "linux" ] || [ "$MODE" = "all" ]; then
  echo "== linux harness =="
  gcc -O2 -o harness $SRC src/harness.c -lm
  echo "built ./harness"
fi
if [ "$MODE" = "windows" ] || [ "$MODE" = "all" ]; then
  echo "== windows exe =="
  mkdir -p dist
  ZIG=${ZIG:-$HOME/.local/lib/python3.11/site-packages/ziglang/zig}
  "$ZIG" cc -target x86_64-windows-gnu -O2 $SRC src/platform_win32.c \
     -luser32 -lgdi32 -lwinmm -o dist/Metrodivinia.exe
  echo "built dist/Metrodivinia.exe"
fi
