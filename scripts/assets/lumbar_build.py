"""BodyParts3D lumbar X-ray, real bones AND real L1/S1 discs, no ZIP full download.
python3 lumbar_build.py --fetch /private/tmp/side-lumbar-build/raw
blender -b --python lumbar_build.py -- RAW WORK/lumbar_raw.glb OUT/lumbar.json [4000]
Sources: DBCLS BodyParts3D 3.0 obj_95, CC BY 4.0; see README side section.
"""
import sys, json, os
from pathlib import Path
PARTS={**{f'L{i}':f'FMA{13071+i}' for i in range(1,6)},'sacrum':'FMA16202',
       **{f'disc_L{i}':f'FMA{16032+i}' for i in range(1,6)}}
URL='https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_95.zip'

def fetch(raw):
    # Same CRC-checked central-directory / per-entry Range algorithm as organs_build.py.
    import urllib.request, struct, zlib
    def get(a,b):
        req=urllib.request.Request(URL,headers={'Range':f'bytes={a}-{b}'})
        with urllib.request.urlopen(req,timeout=90) as r:
            if r.status!=206: raise RuntimeError('Server must honor HTTP ranges')
            return r.read()
    with urllib.request.urlopen(urllib.request.Request(URL,method='HEAD'),timeout=60) as r:
        size=int(r.headers['Content-Length'])
    tail=get(size-65536,size-1); off=tail.rfind(b'PK\x05\x06')
    _,_,_,_,_,length,start,_=struct.unpack('<IHHHHIIH',tail[off:off+22])
    cd=get(start,start+length-1); pos=0; entries={}
    while pos<len(cd):
        f=struct.unpack('<IHHHHHHIIIHHHHHII',cd[pos:pos+46]); nl,el,cl=f[10:13]
        name=cd[pos+46:pos+46+nl].decode().replace('\\','/').split('/')[-1]
        entries[name]=(f[4],f[7],f[8],f[9],f[16]); pos+=46+nl+el+cl
    raw=Path(raw); raw.mkdir(parents=True,exist_ok=True)
    for id in PARTS.values():
        name=id+'.obj'; path=raw/name
        if path.exists(): continue
        method,crc,packed,unpacked,local=entries[name]
        h=get(local,local+29); nl,el=struct.unpack('<HH',h[26:30]); start=local+30+nl+el
        data=get(start,start+packed-1)
        if method==8: data=zlib.decompress(data,-15)
        assert len(data)==unpacked and zlib.crc32(data)==crc
        path.write_bytes(data); print('FETCH',name,len(data),flush=True)

def build(raw, output, metadata, target=4000):
    import bpy, numpy as np
    from mathutils import Vector, Matrix
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    objects={}; points={}
    for name,id in PARTS.items():
        # Read OBJ vertices/faces directly, avoiding importer's axis defaults.
        vv=[]; ff=[]
        for line in (Path(raw)/(id+'.obj')).read_text().splitlines():
            if line.startswith('v '): vv.append([float(x)*.001 for x in line.split()[1:4]])
            elif line.startswith('f '): ff.append([int(x.split('/')[0])-1 for x in line.split()[1:]])
        points[name]=np.array(vv)
        me=bpy.data.meshes.new(name); me.from_pydata(vv,[],ff); me.update()
        o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); objects[name]=o
    disc=points['disc_L4']; offset=(disc.min(0)+disc.max(0))/2
    def g(p):
        q=np.array(p)-offset
        return [round(float(q[0]),6),round(float(q[2]),6),round(float(q[1]),6)]
    def centre(v): return (v.min(0)+v.max(0))/2
    meta={'source':'BodyParts3D 3.0 obj_95 © DBCLS, CC BY 4.0','url':URL,
          'frame':'+x patient left, +y superior, +z posterior; metres; origin L4/L5 disc centre',
          'originSourceMetres':offset.tolist(),'vertebrae':{},'discs':{},'joints':{}}
    for name,o in objects.items():
        v=points[name]; c=centre(v)
        if name.startswith('disc'):
            pivot=c; meta['discs'][name]={'centre':g(c),'source':PARTS[name]}
        else:
            # Body centre excludes the posterior arch / processes. Facets are geometric
            # landmark estimates on the real articular-process surface, not labelled BP3D parts.
            body=v[v[:,1] < np.quantile(v[:,1],.43)]; pivot=centre(body)
            facets={}
            for side,sign in [('left',1),('right',-1)]:
                region=v[(sign*(v[:,0]-pivot[0])>.009)&(sign*(v[:,0]-pivot[0])<.033)&
                         (v[:,1]>pivot[1]+.018)&(v[:,1]<pivot[1]+.052)]
                if len(region)<8: region=v[v[:,0]*sign>pivot[0]*sign]
                zmid=np.median(region[:,2])
                for level in ('superior','inferior'):
                    q=region[region[:,2]>=zmid] if level=='superior' else region[region[:,2]<zmid]
                    # Midpoint projected to a real vertex on the process, stable after decimation.
                    mid=centre(q); pt=q[np.argmin(np.linalg.norm(q-mid,axis=1))]
                    facets[side+'_'+level]=g(pt)
            meta['vertebrae'][name]={'pivot':g(pivot),'facets':facets,'source':PARTS[name],
                'landmarkMethod':'geometric articular-process surface estimate; review in oblique preview'}
        # Source +Y posterior -> Blender -Y posterior -> glTF +Z posterior.
        # Reflection changes handedness, so reverse polygon winding, never node scale.
        p=g(pivot); o.location=(p[0],-p[2],p[1])
        m=Matrix(((1,0,0,-pivot[0]),(0,-1,0,pivot[1]),(0,0,1,-pivot[2]),(0,0,0,1)))
        o.data.transform(m); o.data.flip_normals()
        before=sum(len(p.vertices)-2 for p in o.data.polygons)
        budget=700 if name.startswith('disc') else (5500 if name=='sacrum' else target)
        bpy.context.view_layer.objects.active=o
        if before>budget:
            mod=o.modifiers.new('preserve_processes','DECIMATE'); mod.ratio=budget/before; mod.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in o.data.polygons: p.use_smooth=True
        mat=bpy.data.materials.new('lumbar.disc' if name.startswith('disc') else 'lumbar.bone'); mat.use_nodes=True
        bs=mat.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value=(.18,.42,.48,1) if name.startswith('disc') else (.72,.79,.73,1)
        bs.inputs['Roughness'].default_value=.95; o.data.materials.append(mat)
        o['source']=PARTS[name]; o['license']='© DBCLS, CC BY 4.0'
        print('MESH',name,'triangles',before,'->',sum(len(p.vertices)-2 for p in o.data.polygons),'pivot',g(pivot),flush=True)
    for i in range(1,6):
        a=meta['vertebrae'][f'L{i}']['facets']; b=meta['vertebrae'][f'L{i+1}' if i<5 else 'sacrum']['facets']
        meta['joints'][f'L{i}/'+(f'L{i+1}' if i<5 else 'S1')]={s:[round((x+y)/2,6) for x,y in zip(a[s+'_inferior'],b[s+'_superior'])] for s in ('left','right')}
    Path(metadata).write_text(json.dumps(meta,ensure_ascii=False,indent=2))
    bpy.ops.export_scene.gltf(filepath=str(output),export_format='GLB',export_yup=True,export_extras=True,export_animations=False)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(output).parent/'lumbar.blend'))
    print('LUMBAR_METADATA',json.dumps(meta),flush=True)

if __name__=='__main__':
    if '--fetch' in sys.argv: fetch(sys.argv[sys.argv.index('--fetch')+1])
    else:
        a=sys.argv[sys.argv.index('--')+1:]; build(a[0],a[1],a[2],int(a[3]) if len(a)>3 else 4000)
