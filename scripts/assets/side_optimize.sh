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
if [[ "${SIDE_ONLY:-}" != lumbar ]]; then
run_logged patient "$HERE/side_patient.py" "$W/patient_raw.glb" "$DEST/patient_marks.json" "$W"
run_logged therapist "$HERE/side_therapist.py" "$W/therapist_raw.glb" "$DEST/patient_marks.json" "$W"
fi
python3 "$HERE/lumbar_build.py" --fetch "$W/raw"
run_logged lumbar "$HERE/lumbar_build.py" "$W/raw" "$W/lumbar_bones.blend" "$DEST/lumbar.json"
# These stages must open the preceding blend, including when MPFB bootstrap is used elsewhere.
"$B" -b "$W/lumbar_bones.blend" ${SIDE_BLENDER_FLAGS:-} --python-exit-code 1 --python "$HERE/lumbar_cord.py" -- "$W/lumbar_cord.blend" > "$W/lumbar_cord.log" 2>&1
"$B" -b "$W/lumbar_cord.blend" ${SIDE_BLENDER_FLAGS:-} --python-exit-code 1 --python "$HERE/spine_bake.py" -- "$W/lumbar_baked.blend" "$W/lumbar_raw.glb" 64 > "$W/lumbar_bake.log" 2>&1
export npm_config_cache=${npm_config_cache:-"$W/npm-cache"}
if [[ "${SIDE_ONLY:-}" != lumbar ]]; then
for who in patient therapist; do
  npx --yes @gltf-transform/cli@4.5.1 resize "$W/${who}_raw.glb" "$W/${who}_size.glb" --width 1024 --height 1024
  npx --yes @gltf-transform/cli@4.5.1 webp "$W/${who}_size.glb" "$W/${who}_webp.glb" --quality 82
  npx --yes @gltf-transform/cli@4.5.1 meshopt "$W/${who}_webp.glb" "$DEST/$who.glb"
done
fi
npx --yes @gltf-transform/cli@4.5.1 meshopt "$W/lumbar_raw.glb" "$DEST/lumbar.glb"
WHO=(lumbar)
if [[ "${SIDE_ONLY:-}" != lumbar ]]; then WHO=(patient therapist lumbar); fi
for who in "${WHO[@]}"; do
  npx --yes @gltf-transform/cli@4.5.1 inspect "$DEST/$who.glb" > "$OUT/${who}_inspect.txt"
done
# Inspect the final compressed GLB JSON without loading Blender / GPU libraries.
python3 - "$DEST" "${SIDE_ONLY:-}" <<'PY'
import json, struct, sys
from pathlib import Path
expected={'patient':['lieL','lieR','rollLR','rollRL'],
          'therapist':['setupL','setupR','walkLR','walkRL'],'lumbar':[]}
if sys.argv[2]=='lumbar': expected={'lumbar':[]}
for who,names in expected.items():
    path=Path(sys.argv[1])/(who+'.glb'); blob=path.read_bytes()
    size=struct.unpack_from('<I',blob,12)[0]; doc=json.loads(blob[20:20+size])
    actual=[a.get('name') for a in doc.get('animations',[])]
    print('FINAL_GLB',who,'bytes',len(blob),'animations',actual,flush=True)
    assert set(actual)==set(names),(who,actual,names)
    for node in doc.get('nodes',[]):
        assert all(s>0 for s in node.get('scale',[1,1,1])),(who,'nonpositive scale',node.get('name'))
    assert len(blob)<=1_100_000,(who,'over 1.1 MB',len(blob))
    if who=='lumbar':
        assert len(blob)<=900_000,('lumbar over 900 KB',len(blob))
        nodes={n.get('name'):n for n in doc.get('nodes',[])}
        required=['T11','T12','L1','L2','L3','L4','L5','Sacrum','Cord']
        required += ['Disc_'+a+'_'+b for a,b in zip(['T11','T12','L1','L2','L3','L4','L5'],['T12','L1','L2','L3','L4','L5','S1'])]
        required += [f'Root_{i}_{side}' for i in range(7) for side in ('L','R')]
        assert set(required)<=nodes.keys(),set(required)-nodes.keys()
        for name in required:
            node=nodes[name]
            assert 'mesh' not in node and node.get('children'),('missing stable empty',name)
            child=nodes.get(name+'_geo'); assert child and 'mesh' in child,('missing child mesh',name)
            primitives=doc['meshes'][child['mesh']]['primitives']
            assert all('COLOR_0' in p['attributes'] for p in primitives),('missing AO COLOR_0',name)
PY
if [[ "${SIDE_ONLY:-}" != lumbar ]]; then
run_logged preview "$HERE/side_therapist.py" --preview "$W" "$OUT"
fi
echo "SIDE_COMPLETE logs=$W previews=$OUT"
