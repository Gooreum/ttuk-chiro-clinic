"""Report complete GLB bytes / triangle counts without decoding meshopt.

Run from the repository root: python3 scripts/assets/towel_stage_metrics.py
Accessor counts remain available in the GLB JSON even when buffers are compressed.
"""
import json
import struct
from pathlib import Path


def metrics(path):
    data = path.read_bytes()
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    triangles = sum(
        gltf["accessors"][p.get("indices", p["attributes"]["POSITION"])]["count"] // 3
        for mesh in gltf["meshes"] for p in mesh["primitives"]
        if p.get("mode", 4) == 4
    )
    return {"bytes": len(data), "triangles": triangles}


if __name__ == "__main__":
    root = Path("public/models")
    rows = []
    for asset in sorted((root / "towel-stage").rglob("*.glb")):
        name = asset.relative_to(root / "towel-stage")
        original = root / name
        rows.append({
            "asset": str(name),
            "before": metrics(original) if original.exists() else {
                "bytes": None, "triangles": 1944,
                "note": "Original room/table: 49 runtime meshes, no GLB file"
            },
            "after": metrics(asset),
        })
    print(json.dumps(rows, indent=2, ensure_ascii=False))
