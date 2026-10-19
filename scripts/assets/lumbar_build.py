"""BodyParts3D 3.0 lumbar chain; build only on the unsandboxed host.
python3 lumbar_build.py --fetch RAW
blender -b --python lumbar_build.py -- RAW OUT.blend OUT/lumbar.json
"""
import sys, json, re, urllib.request
from pathlib import Path
URL='https://dbarchive.biosciencedbc.jp/data/bodyparts3d/20110915/BodyParts3D_3.0_obj_95.zip'
LIST_BASE='https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/'
CHAIN=['T11','T12','L1','L2','L3','L4','L5','Sacrum']
DISC_NAMES=['Disc_'+a+'_'+('S1' if b=='Sacrum' else b) for a,b in zip(CHAIN,CHAIN[1:])]

def resolve_parts(raw):
    """Resolve unverified IDs from official labels, never from numerical proximity."""
    raw=Path(raw); raw.mkdir(parents=True,exist_ok=True)
    manifest=raw/'lumbar_parts.json'
    if manifest.exists(): return json.loads(manifest.read_text())['parts']
    labels={}
    for filename in ('isa_parts_list_e.txt','partof_parts_list_e.txt'):
        path=raw/filename
        if not path.exists():
            with urllib.request.urlopen(LIST_BASE+filename,timeout=90) as response:
                path.write_bytes(response.read())
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            # Official lists are tab separated; collect adjacent ID/name columns.
            # concept id, representation id, English name: the name is the last column
            columns=line.split('\t')
            if len(columns)>=3 and re.fullmatch(r'FMA\d+',columns[0].strip()):
                labels.setdefault(columns[0].strip(),set()).add(columns[-1].strip().lower())
    def choose(name, pattern):
        hits=[id for id,names in labels.items() if any(re.fullmatch(pattern,label) for label in names)]
        if len(hits)!=1: raise RuntimeError(f'Official list resolution ambiguous/missing: {name}: {hits}; inspect {raw}')
        print('RESOLVE',name,hits[0],sorted(labels[hits[0]]),flush=True)
        return hits[0]
    parts={f'L{i}':f'FMA{13071+i}' for i in range(1,6)}
    parts['Sacrum']='FMA16202'
    for level,word in [('T11','eleventh'),('T12','twelfth')]:
        parts[level]=choose(level,rf'(?:{word} thoracic vertebra|thoracic vertebra {11 if level=="T11" else 12})')
    # "intervertebral disk of eleventh thoracic vertebra" is the disc under T11 (T11/12). BodyParts3D has no disc of the
    # twelfth thoracic vertebra: build() makes T12/L1 from the L1/2 disc fitted into the gap (marked SYNTH).
    parts[DISC_NAMES[0]]=choose(DISC_NAMES[0],r'intervertebral (?:disc|disk) of eleventh thoracic vertebra')
    parts[DISC_NAMES[1]]='SYNTH:'+DISC_NAMES[2]
    # These five are deliberately assigned by measured height in build(), not guessed labels.
    for i in range(5): parts[f'LumbarDiscCandidate_{i}']=f'FMA{16033+i}'
    manifest.write_text(json.dumps({'parts':parts,'labelSource':LIST_BASE,'labels':{id:sorted(labels.get(id,[])) for id in parts.values()}},indent=2))
    return parts

def fetch(raw):
    parts = resolve_parts(raw)
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
    for id in parts.values():
        if id.startswith('SYNTH:'): continue
        name=id+'.obj'; path=raw/name
        if path.exists(): continue
        method,crc,packed,unpacked,local=entries[name]
        h=get(local,local+29); nl,el=struct.unpack('<HH',h[26:30]); start=local+30+nl+el
        data=get(start,start+packed-1)
        if method==8: data=zlib.decompress(data,-15)
        assert len(data)==unpacked and zlib.crc32(data)==crc
        path.write_bytes(data); print('FETCH',name,len(data),flush=True)

def build(raw, output, metadata):
    import bpy, numpy as np, math
    from mathutils import Matrix
    parts=json.loads((Path(raw)/'lumbar_parts.json').read_text())['parts']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    points={}; faces={}
    for name,id in parts.items():
        if id.startswith('SYNTH:'): continue
        vv=[]; ff=[]
        for line in (Path(raw)/(id+'.obj')).read_text().splitlines():
            if line.startswith('v '): vv.append([float(x)*.001 for x in line.split()[1:4]])
            elif line.startswith('f '): ff.append([int(x.split('/')[0])-1 for x in line.split()[1:]])
        points[name]=np.array(vv); faces[name]=ff
    centre=lambda v:(v.min(0)+v.max(0))/2
    candidates=sorted([n for n in points if n.startswith('LumbarDiscCandidate')],key=lambda n:centre(points[n])[2],reverse=True)
    for name,candidate in zip(DISC_NAMES[2:],candidates):
        points[name]=points.pop(candidate); faces[name]=faces.pop(candidate); parts[name]=parts.pop(candidate)
        print('DISC_HEIGHT_ASSIGN',name,parts[name],centre(points[name])[2],flush=True)
    pivots={}
    for n in CHAIN:
        v=points[n]
        # Source anterior is -Y, same frame as spine_build's OBJ importer.
        body=v[v[:,1]<np.quantile(v[:,1],.43)]
        pivots[n]=centre(body)
    # T12/L1: the L1/2 disc's shape, fitted between the T12 body's lower endplate and the L1 body's upper one
    # endplate centres: the column of body vertices within 12 mm of the body pivot in plan view
    core=lambda n:points[n][(np.abs(points[n][:,0]-pivots[n][0])<.012)&(np.abs(points[n][:,1]-pivots[n][1])<.012)]
    lo,hi=core('T12')[:,2].min(),core('L1')[:,2].max()
    src=points['Disc_L1_L2']; c=centre(src); h=src[:,2].max()-src[:,2].min()
    k=np.array([.94,.94,max(.4,(lo-hi)/h)])
    tgt=np.array([(pivots['T12'][0]+pivots['L1'][0])/2,(pivots['T12'][1]+pivots['L1'][1])/2,(lo+hi)/2])
    points['Disc_T12_L1']=(src-c)*k+tgt; faces['Disc_T12_L1']=faces['Disc_L1_L2']
    print('SYNTH Disc_T12_L1 from Disc_L1_L2 gap',round((lo-hi)*1000,1),'mm',flush=True)
    for a,b,d in zip(CHAIN,CHAIN[1:],DISC_NAMES):
        za,zb,zd=pivots[a][2],pivots[b][2],centre(points[d])[2]
        if not za>zd>zb: raise RuntimeError(f'Invalid superior order / disc mapping: {a} {za}, {d} {zd}, {b} {zb}')
    offset=centre(points['Disc_L4_L5'])
    def g(p): return [round(float(x),7) for x in np.array(p)-offset]
    meta={'source':'BodyParts3D 3.0 obj_95 © DBCLS, CC BY 4.0','url':URL,'license':'CC BY 4.0',
          'frame':'Blender +Z superior, -Y anterior, +X patient left; metres; origin L4/L5 disc centre; glTF (x,z,-y)',
          'originSourceMetres':offset.tolist(),'sourceFMA':parts,'vertebrae':{},'discs':{},'joints':{}}
    Path(output).parent.mkdir(parents=True,exist_ok=True)
    Path(metadata).parent.mkdir(parents=True,exist_ok=True)
    for name,v in points.items():
        disc=name.startswith('Disc_'); pivot=centre(v) if disc else pivots[name]
        me=bpy.data.meshes.new(name); me.from_pydata((v-pivot).tolist(),[],faces[name]); me.update()
        o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o)
        o.location=g(pivot); o['origin']=g(pivot); o['source']=parts[name]; o['license']='© DBCLS, CC BY 4.0'
        bpy.context.view_layer.objects.active=o; o.select_set(True)
        before=sum(len(p.vertices)-2 for p in me.polygons)
        budget=1500 if disc else 14000 if name=='Sacrum' else 12000
        if before>budget:
            m=o.modifiers.new('preserve_processes','DECIMATE'); m.ratio=budget/before; m.use_collapse_triangulate=True
            bpy.ops.object.modifier_apply(modifier=m.name)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50 if disc else 42))
        wn=o.modifiers.new('wn','WEIGHTED_NORMAL'); wn.keep_sharp=True; wn.weight=50
        bpy.ops.object.modifier_apply(modifier=wn.name); o.select_set(False)
        if disc: meta['discs'][name]={'centre':g(pivot),'source':parts[name]}
        else:
            facets={}
            for side,sign in [('left',1),('right',-1)]:
                region=v[(sign*(v[:,0]-pivot[0])>.009)&(sign*(v[:,0]-pivot[0])<.033)&(v[:,1]>pivot[1]+.018)&(v[:,1]<pivot[1]+.052)]
                if len(region)<8: region=v[sign*(v[:,0]-pivot[0])>0]
                zmid=np.median(region[:,2])
                for level in ('superior','inferior'):
                    q=region[region[:,2]>=zmid] if level=='superior' else region[region[:,2]<zmid]
                    if not len(q): raise RuntimeError('Empty facet estimate: '+name)
                    mid=centre(q); facets[side+'_'+level]=g(q[np.argmin(np.linalg.norm(q-mid,axis=1))])
            meta['vertebrae'][name]={'pivot':g(pivot),'facets':facets,'source':parts[name],'landmarkMethod':'geometric articular-process surface estimate; review in oblique preview'}
        print('MESH',name,parts[name],before,'->',sum(len(p.vertices)-2 for p in o.data.polygons),flush=True)
    for a,b in zip(CHAIN,CHAIN[1:]):
        fa,fb=meta['vertebrae'][a]['facets'],meta['vertebrae'][b]['facets']
        meta['joints'][a+'/'+('S1' if b=='Sacrum' else b)]={s:[round((x+y)/2,7) for x,y in zip(fa[s+'_inferior'],fb[s+'_superior'])] for s in ('left','right')}
    Path(metadata).write_text(json.dumps(meta,indent=2))
    bpy.ops.wm.save_as_mainfile(filepath=str(output))

if __name__=='__main__':
    if '--fetch' in sys.argv: fetch(sys.argv[sys.argv.index('--fetch')+1])
    else:
        a=sys.argv[sys.argv.index('--')+1:]; build(*a)
