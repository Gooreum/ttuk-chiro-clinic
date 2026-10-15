#!/usr/bin/env bash
# Back-press mode assets: build (Blender + MPFB) and optimize into public/models/back.
#   bash scripts/assets/back_optimize.sh <work dir> [bake_size=1024] [cycles_samples=16]
# M-series CPU: about 2 minutes for both bakes at 1024 / 16 samples.
set -euo pipefail
W=${1:?work dir}; BAKE=${2:-1024}; SAMP=${3:-16}
HERE=$(cd "$(dirname "$0")" && pwd); OUT="$HERE/../../public/models/back"
B=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
G=${GLTF_TRANSFORM:-"npx --yes @gltf-transform/cli@4.5.1"}
mkdir -p "$W" "$OUT"
cd "$HERE"
"$B" -b --python back_patient.py -- "$W/patient_raw.glb" "$W/back_surface.json" "$BAKE" "$SAMP" > "$W/patient.log" 2>&1
"$B" -b --python back_therapist.py -- "$W/therapist_raw.glb" "$W/back_surface.json" "$BAKE" "$SAMP" > "$W/therapist.log" 2>&1
grep -E "POSE|SOLVE|ELBOW|MEASURE|WROTE" "$W/patient.log" "$W/therapist.log"

$G resize "$W/patient_raw.glb" "$W/p1.glb" --width 512 --height 512 --pattern "short02*"
$G resize "$W/p1.glb" "$W/p2.glb" --width 512 --height 512 --pattern "male_casualsuit06_normal*"
$G webp "$W/p2.glb" "$W/p3.glb" --quality 85
$G meshopt "$W/p3.glb" "$OUT/patient.glb"

$G resize "$W/therapist_raw.glb" "$W/t1.glb" --width 512 --height 512 --pattern "short04*"
$G resize "$W/t1.glb" "$W/t2.glb" --width 512 --height 512 --pattern "male_casualsuit06_normal*"
$G resize "$W/t2.glb" "$W/t3.glb" --width 256 --height 256 --pattern "shoes05*"
$G resize "$W/t3.glb" "$W/t4.glb" --width 256 --height 256 --pattern "back_therapist_eye*"
$G resize "$W/t4.glb" "$W/t5.glb" --width 256 --height 256 --pattern "eye[bl]*"
$G webp "$W/t5.glb" "$W/t6.glb" --quality 85
$G meshopt "$W/t6.glb" "$OUT/therapist.glb"

cp "$W/back_surface.json" "$OUT/back_surface.json"
ls -la "$OUT"
