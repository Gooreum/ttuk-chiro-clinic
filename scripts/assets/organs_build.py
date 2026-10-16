# /opt/homebrew/bin/blender -b --factory-startup --python scripts/assets/organs_build.py -- RAW_DIR OUT_raw.glb [ORGAN_TRIS]
#
# BodyParts3D (c) DBCLS, CC BY 4.0. Real segmented anatomy, no procedural organ shapes.
# Download only the listed OBJ entries with ZIP central-directory HTTP ranges:
#   python3 scripts/assets/organs_build.py --fetch SCRATCH/organs/raw
#   blender -b --factory-startup --python scripts/assets/organs_build.py -- SCRATCH/organs/raw SCRATCH/organs/raw.glb 3000
#   npx --yes @gltf-transform/cli@4.5.1 meshopt SCRATCH/organs/raw.glb public/models/back/organs.glb
# All downloads and intermediate files belong outside the repository.
# Shape: BodyParts3D_3.0_obj_95 (20110915), compound definitions in composite_parts.txt.
# Lung lobes and bowel components are joined; FMA7274 is the actual exterior wall of heart (FMA7088).
# Frame identical to spine_build.py: mm -> m; XY origin = 4.0 C1-C7 combined bbox centre,
# Z origin = bottom of 4.0 C7. Blender +Z superior, -Y anterior, +X patient left;
# glTF +y superior, +z anterior. T1/L5 markers retain the 3.0 organ registration.
import sys, os
from pathlib import Path
PARTS = {
    'lungL': ['FMA7370', 'FMA7371'],                  # FMA7310
    'lungR': ['FMA7333', 'FMA7337', 'FMA7383'],       # FMA7309
    'heart': ['FMA7274'],                           # FMA7088 exterior wall
    'liver': ['FMA7197'], 'stomach': ['FMA7148'], 'spleen': ['FMA7196'],
    'kidneyL': ['FMA7205'], 'kidneyR': ['FMA7204'],
    'bowel': ['FMA7206', 'FMA7207', 'FMA7208', 'FMA14543nsn'],  # FMA7200 + FMA7201, actual gut walls
}
CERV = ['FJ3176', 'FJ3177', 'FJ3161', 'FJ3164', 'FJ3167', 'FJ3170', 'FJ3172']
REFS = {'T1': 'FMA9165', 'L5': 'FMA13076'}
BASE = 'https://dbarchive.biosciencedbc.jp/data/bodyparts3d/'

def fetch_entries(url, out, names):
    import urllib.request, struct, zlib
    def get(a, b):
        req = urllib.request.Request(url, headers={'Range': f'bytes={a}-{b}'})
        with urllib.request.urlopen(req, timeout=90) as r:
            if r.status != 206: raise RuntimeError('Server must honor HTTP ranges')
            return r.read()
    with urllib.request.urlopen(urllib.request.Request(url, method='HEAD'), timeout=60) as r:
        size = int(r.headers['Content-Length'])
    tail = get(size-65536, size-1); off = tail.rfind(b'PK\x05\x06')
    if off < 0: raise RuntimeError('ZIP central directory not found')
    _, _, _, _, _, length, start, _ = struct.unpack('<IHHHHIIH', tail[off:off+22])
    cd = get(start, start+length-1); pos = 0; entries = {}
    while pos < len(cd):
        fields = struct.unpack('<IHHHHHHIIIHHHHHII', cd[pos:pos+46])
        method, crc, packed, unpacked = fields[4], fields[7], fields[8], fields[9]
        nl, el, cl, local = fields[10], fields[11], fields[12], fields[16]
        name = cd[pos+46:pos+46+nl].decode().replace('\\', '/').split('/')[-1]
        entries[name] = method, crc, packed, unpacked, local
        pos += 46+nl+el+cl
    out.mkdir(parents=True, exist_ok=True)
    for name in names:
        if (out/name).exists(): continue
        method, crc, packed, unpacked, local = entries[name]
        head = get(local, local+29); nl, el = struct.unpack('<HH', head[26:30])
        start = local+30+nl+el; data = get(start, start+packed-1)
        if method == 8: data = zlib.decompress(data, -15)
        elif method != 0: raise RuntimeError('Unsupported ZIP compression')
        assert len(data) == unpacked and zlib.crc32(data) == crc
        (out/name).write_bytes(data); print('FETCH', name, len(data), flush=True)

if '--fetch' in sys.argv:
    out = Path(sys.argv[sys.argv.index('--fetch')+1])
    names = sorted({s+'.obj' for ids in PARTS.values() for s in ids} | {s+'.obj' for s in REFS.values()})
    fetch_entries(BASE+'20110915/BodyParts3D_3.0_obj_95.zip', out, names)
    fetch_entries(BASE+'LATEST/partof_BP3D_4.0_obj_99.zip', out, [s+'.obj' for s in CERV])
    sys.exit(0)

# CPU fallback for restricted hosts where Blender's Metal startup fails before Python.
# python3 organs_build.py --cpu RAW_DIR OUT_raw.glb [ORGAN_TRIS]
# Requires numpy, trimesh, fast-simplification (install in a scratchpad venv).
if '--cpu' in sys.argv:
    import numpy as np, trimesh
    args = sys.argv[sys.argv.index('--cpu')+1:]
    raw, output = Path(args[0]), Path(args[1]); target = int(args[2]) if len(args)>2 else 3000
    def load_cpu(id):
        return trimesh.load(raw/(id+'.obj'), force='mesh', process=True)
    refs = [load_cpu(id) for id in CERV]
    v = np.concatenate([m.vertices for m in refs]); offset = (v.min(0)+v.max(0))/2
    offset[2] = refs[-1].vertices[:,2].min(); offset *= .001
    def frame(v):
        b = v*.001-offset
        return b[:,[0,2,1]]*np.array([1,1,-1])  # Blender xyz -> glTF x,z,-y
    scene = trimesh.Scene()
    print('OFFSET_m',offset.tolist())
    for name,id in REFS.items():
        c = load_cpu(id).bounds.mean(0).reshape(1,3); matrix = np.eye(4); matrix[:3,3] = frame(c)[0]
        scene.graph.update(frame_to='ref_'+name,matrix=matrix)
    for name,ids in PARTS.items():
        mesh = trimesh.util.concatenate([load_cpu(id) for id in ids]); mesh.vertices = frame(mesh.vertices)
        before = len(mesh.faces)
        if before>target: mesh = mesh.simplify_quadric_decimation(face_count=target, aggression=10)
        if name=='heart' and len(mesh.faces)>target:
            # Segmented wall contains hundreds of isolated specks. Keep the wall and
            # meaningful islands; discard only residual islands smaller than 16 faces.
            parent = list(range(len(mesh.vertices)))
            def find(a):
                while parent[a]!=a: parent[a]=parent[parent[a]]; a=parent[a]
                return a
            for a,b,c in mesh.faces:
                a=find(a)
                for v in [b,c]: parent[find(v)]=a
            roots=np.array([find(a) for a in mesh.faces[:,0]])
            counts=np.bincount(roots,minlength=len(mesh.vertices))
            mesh.update_faces(counts[roots]>=16); mesh.remove_unreferenced_vertices()
        centre = mesh.bounds.mean(0); mesh.vertices -= centre
        # Area-weighted smooth normals, without scipy/GPU dependencies.
        normals = np.zeros_like(mesh.vertices); triangles = mesh.vertices[mesh.faces]
        face_normals = np.cross(triangles[:,1]-triangles[:,0],triangles[:,2]-triangles[:,0])
        for corner in range(3): np.add.at(normals,mesh.faces[:,corner],face_normals)
        normals /= np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-12)
        mesh.vertex_normals = normals
        mesh.metadata = {'source': ', '.join(ids), 'license': 'BodyParts3D (c) DBCLS, CC BY 4.0'}
        matrix = np.eye(4); matrix[:3,3] = centre
        scene.add_geometry(mesh, geom_name=name, node_name=name, transform=matrix)
        print('TRIS',name,before,'->',len(mesh.faces),'CENTRE_gltf',centre.tolist(),flush=True)
    output.write_bytes(scene.export(file_type='glb', include_normals=True))
    sys.exit(0)

import bpy, numpy as np
from mathutils import Matrix, Vector
argv = sys.argv[sys.argv.index('--')+1:]
raw, output = Path(argv[0]), argv[1]
TRIS = int(argv[2]) if len(argv)>2 else 3000
bpy.ops.wm.read_factory_settings(use_empty=True)

def load(id):
    bpy.ops.wm.obj_import(filepath=str(raw/(id+'.obj')), forward_axis='Y', up_axis='Z')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    if len(bpy.context.selected_objects)>1: bpy.ops.object.join()
    o = bpy.context.object; o.data.transform(Matrix.Scale(.001, 4)); return o

def verts(o):
    a = np.empty(len(o.data.vertices)*3); o.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)

def centre(o):
    v = verts(o); return (v.min(0)+v.max(0))/2

ref = [load(id) for id in CERV]
v = np.concatenate([verts(o) for o in ref]); offset = (v.min(0)+v.max(0))/2
offset[2] = verts(ref[-1])[:,2].min()
for o in ref: bpy.data.objects.remove(o, do_unlink=True)
print('OFFSET_m', list(offset))
for name, id in REFS.items():
    o = load(id); c = centre(o)-offset; bpy.data.objects.remove(o, do_unlink=True)
    marker = bpy.data.objects.new('ref_'+name, None); bpy.context.collection.objects.link(marker)
    marker.location = c; marker['source'] = id; marker['frame'] = 'spine_build.py / metres'

for name, ids in PARTS.items():
    parts = [load(id) for id in ids]
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts: o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts)>1: bpy.ops.object.join()
    o = bpy.context.object; o.name = name; o.data.name = name
    o.data.transform(Matrix.Translation(-Vector(offset)))
    before = sum(len(p.vertices)-2 for p in o.data.polygons)
    if before>TRIS:
        m = o.modifiers.new('anatomy_decimate', 'DECIMATE'); m.ratio = TRIS/before; m.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p in o.data.polygons: p.use_smooth = True
    c = centre(o); o.data.transform(Matrix.Translation(-Vector(c))); o.location = c
    o['source'] = ', '.join(ids); o['license'] = 'BodyParts3D (c) DBCLS, CC BY 4.0'
    print('TRIS', name, before, '->', sum(len(p.vertices)-2 for p in o.data.polygons), 'CENTRE', list(c))
    mat = bpy.data.materials.new(name+'_reference'); mat.diffuse_color = (.65,.7,.68,1); o.data.materials.clear(); o.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=output, export_format='GLB', export_extras=True, export_yup=True)
