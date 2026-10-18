#!/usr/bin/env bash
# Claude / unsandboxed host ONLY:
# bash scripts/assets/side_optimize.sh /private/tmp/side-lumbar-build [OUT]
# Codex sandbox: do not execute this command or any Blender subprocess.
# All intermediates remain outside the repository. No commit, no game changes.
set -euo pipefail
W=${1:?scratch work directory}; OUT=${2:-"$W/out"}
HERE=$(cd "$(dirname "$0")" && pwd)
DEST="$HERE/../../public/models/side"
B=${BLENDER:-/opt/homebrew/bin/blender}
mkdir -p "$W" "$OUT" "$DEST"
run_blender() {
  if [[ -n "${SIDE_BOOTSTRAP:-}" ]]; then
    "$B" -b --factory-startup ${SIDE_BLENDER_FLAGS:-} --python-exit-code 1 --python "$SIDE_BOOTSTRAP" -- "$@"
  else
    local script=$1; shift
    "$B" -b ${SIDE_BLENDER_FLAGS:-} --python-exit-code 1 --python "$script" -- "$@"
  fi
}
run_logged() {
  local label=$1; shift
  echo "SIDE_STAGE $label -> $W/$label.log"
  if run_blender "$@" > "$W/$label.log" 2>&1; then
    echo "SIDE_STAGE_OK $label"
  else
    local status=$?
    tail -n 100 "$W/$label.log" >&2
    echo "SIDE_STAGE_FAILED $label (exit $status); full log: $W/$label.log" >&2
    return "$status"
  fi
}
run_logged patient "$HERE/side_patient.py" "$W/patient_raw.glb" "$DEST/patient_marks.json" "$W"
run_logged therapist "$HERE/side_therapist.py" "$W/therapist_raw.glb" "$DEST/patient_marks.json" "$W"
python3 "$HERE/lumbar_build.py" --fetch "$W/raw"
run_logged lumbar "$HERE/lumbar_build.py" "$W/raw" "$W/lumbar_raw.glb" "$DEST/lumbar.json" 4000
export npm_config_cache=${npm_config_cache:-"$W/npm-cache"}
for who in patient therapist; do
  npx --yes @gltf-transform/cli@4.5.1 resize "$W/${who}_raw.glb" "$W/${who}_size.glb" --width 1024 --height 1024
  npx --yes @gltf-transform/cli@4.5.1 webp "$W/${who}_size.glb" "$W/${who}_webp.glb" --quality 82
  npx --yes @gltf-transform/cli@4.5.1 meshopt "$W/${who}_webp.glb" "$DEST/$who.glb"
done
npx --yes @gltf-transform/cli@4.5.1 meshopt "$W/lumbar_raw.glb" "$DEST/lumbar.glb"
for who in patient therapist lumbar; do
  npx --yes @gltf-transform/cli@4.5.1 inspect "$DEST/$who.glb" > "$OUT/${who}_inspect.txt"
done
# Inspect the final compressed GLB JSON without loading Blender / GPU libraries.
python3 - "$DEST" <<'PY'
import json, struct, sys
from pathlib import Path
expected={'patient':['lieL','lieR','rollLR','rollRL'],
          'therapist':['setupL','setupR','walkLR','walkRL'],'lumbar':[]}
for who,names in expected.items():
    path=Path(sys.argv[1])/(who+'.glb'); blob=path.read_bytes()
    size=struct.unpack_from('<I',blob,12)[0]; doc=json.loads(blob[20:20+size])
    actual=[a.get('name') for a in doc.get('animations',[])]
    print('FINAL_GLB',who,'bytes',len(blob),'animations',actual,flush=True)
    assert set(actual)==set(names),(who,actual,names)
    for node in doc.get('nodes',[]):
        assert all(s>0 for s in node.get('scale',[1,1,1])),(who,'nonpositive scale',node.get('name'))
    assert len(blob)<=1_100_000,(who,'over 1.1 MB',len(blob))
    if who=='lumbar': assert len(blob)<=400_000,('lumbar over 400 KB',len(blob))
PY
run_logged preview "$HERE/side_therapist.py" --preview "$W" "$OUT"
echo "SIDE_COMPLETE logs=$W previews=$OUT"
