"""MPFB side-posture patient and shared asset helpers. No existing assets are written.
blender -b --python side_patient.py -- WORK/patient_raw.glb MARKS.json [WORK]
The game_engine rest skeleton is retained. Actions use quaternions, positive scale.
See the appended side-posture section in README.md for the coordinate contract.
"""
import bpy, bmesh, importlib, json, math, os, sys
from pathlib import Path
import numpy as np
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
FPS = 30
TABLE = .82
SKIN_REST = TABLE - .01
PATIENT_CLIPS = ('lieL', 'lieR', 'rollLR', 'rollRL')
THERAPIST_CLIPS = ('setupL', 'setupR', 'walkLR', 'walkRL')
def B3(x, y, z): return Vector((x, -z, y))
def T3(p): return [round(p.x, 6), round(p.z, 6), round(-p.y, 6)]
def update(): bpy.context.view_layer.update()

def character(therapist=False):
    P = os.environ.get('SIDE_MPFB_PACKAGE', 'bl_ext.user_default.mpfb')
    HS = importlib.import_module(P+'.services.humanservice').HumanService
    TS = importlib.import_module(P+'.services.targetservice').TargetService
    from patients import human_info
    info = human_info('patient01', rig='game_engine', clothes=True, face=True)
    info['clothes'].append('shoes05/shoes05.mhclo')
    if therapist:
        info['name'] = 'side_therapist'
        info['phenotype'].update(age=.556, muscle=.6, weight=.5, height=.62)
        info['skin_mhmat'] = 'middleage_asian_male/middleage_asian_male.mhmat'
        info['hair'] = 'short04/short04.mhclo'
        info['eyes'] = 'low-poly/low-poly.mhclo'
    st = HS.get_default_deserialization_settings()
    st.update(subdiv_levels=0, load_clothes=True)
    body = HS.deserialize_from_dict(info, st)
    arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    arm.name = 'side_therapist_rig' if therapist else 'side_patient_rig'
    TS.bake_targets(body)
    objects = [o for o in bpy.data.objects if o.type == 'MESH']
    def group(names):
        ids = {body.vertex_groups[n].index for n in names if n in body.vertex_groups}
        return {v.index for v in body.data.vertices if any(g.group in ids and g.weight > 0 for g in v.groups)}
    remove = group(['HelperGeometry', 'JointCubes'])
    for m in body.modifiers:
        if m.type == 'MASK' and m.vertex_group not in ('HelperGeometry','JointCubes'):
            g = group([m.vertex_group])
            remove |= g if m.invert_vertex_group else set(range(len(body.data.vertices)))-g
    for o in objects:
        if o.data.shape_keys: o.shape_key_clear()
        for m in list(o.modifiers):
            if m.type != 'ARMATURE': o.modifiers.remove(m)
    bm = bmesh.new(); bm.from_mesh(body.data); bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[bm.verts[i] for i in remove], context='VERTS')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(body.data); bm.free()
    # Split garment by connected panels, retaining weights and UVs.
    cloth = next(o for o in objects if 'male_casualsuit06' in o.name)
    hipz = arm.data.bones['pelvis'].head_local.z
    bm=bmesh.new(); bm.from_mesh(cloth.data); bm.faces.ensure_lookup_table()
    seen=set(); pants=set()
    for f0 in bm.faces:
        if f0.index in seen: continue
        part=[]; stack=[f0]; seen.add(f0.index)
        while stack:
            f=stack.pop(); part.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g.index not in seen: seen.add(g.index); stack.append(g)
        if sum(f.calc_center_median().z < hipz for f in part)*2 > len(part):
            pants.update(f.index for f in part)
    bm.free()
    jeans=cloth.copy(); jeans.data=cloth.data.copy(); bpy.context.collection.objects.link(jeans)
    def keep(o, ids):
        bm=bmesh.new(); bm.from_mesh(o.data); bm.faces.ensure_lookup_table()
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in ids], context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
        bm.to_mesh(o.data); bm.free()
    keep(jeans, pants); keep(cloth, set(range(len(cloth.data.polygons)))-pants)
    objects.append(jeans)
    body.name='side_skin'; cloth.name='side_shirt'; jeans.name='side_jeans'
    # Original UVs retain the CC0 skin, garment AO, real seam and fold normal map.
    for o in objects:
        src=o.data.materials[0]
        tex=[n.image for n in src.node_tree.nodes if n.type=='TEX_IMAGE' and n.image]
        name=o.name.lower(); color=(1,1,1,1); normal=None
        if o in (cloth, jeans):
            diffuse=next(i for i in tex if 'diffuse' in i.name.lower())
            image=bpy.data.images.load(bpy.path.abspath(diffuse.filepath).replace('_diffuse.png','_ao.png'), check_existing=True)
            color=(.90,.865,.79,1) if o==cloth else (.025,.065,.055,1)
            normal=next((i for i in tex if 'normal' in i.name.lower()),None)
        else:
            image=next((i for i in tex if 'diffuse' in i.name.lower()),tex[0] if tex else None)
            normal=next((i for i in tex if 'normal' in i.name.lower()),None)
        mat=bpy.data.materials.new(('therapist' if therapist else 'patient')+'.'+o.name)
        mat.use_nodes=True; nt=mat.node_tree; bs=nt.nodes.get('Principled BSDF')
        bs.inputs['Base Color'].default_value=color; bs.inputs['Roughness'].default_value=.85 if o in (cloth,jeans) else .65
        if image:
            if max(image.size)>1024: image.scale(1024,1024)
            tx=nt.nodes.new('ShaderNodeTexImage'); tx.image=image
            if o in (cloth,jeans):
                mix=nt.nodes.new('ShaderNodeMixRGB'); mix.blend_type='MULTIPLY'; mix.inputs[0].default_value=1
                nt.links.new(tx.outputs['Color'],mix.inputs[1]); mix.inputs[2].default_value=color
                nt.links.new(mix.outputs[0],bs.inputs['Base Color'])
            else: nt.links.new(tx.outputs['Color'],bs.inputs['Base Color'])
            if any(s in name for s in ('hair','short','eyebrow','eyelash')):
                nt.links.new(tx.outputs['Alpha'],bs.inputs['Alpha'])
                if hasattr(mat,'surface_render_method'): mat.surface_render_method='DITHERED'
                else: mat.blend_method='HASHED'
        if normal:
            if max(normal.size)>1024: normal.scale(1024,1024)
            tx=nt.nodes.new('ShaderNodeTexImage'); tx.image=normal; normal.colorspace_settings.name='Non-Color'
            nm=nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(tx.outputs['Color'],nm.inputs['Color']); nt.links.new(nm.outputs[0],bs.inputs['Normal'])
        o.data.materials.clear(); o.data.materials.append(mat)
        for p in o.data.polygons: p.use_smooth=True
    arm['source']='MakeHuman / MPFB 2.0.18, CC0 system assets'
    # MPFB versions differ in parenting. All evaluated meshes must follow the
    # object root, not just the pose bones. Preserve their original bind world.
    update()
    for o in objects:
        world = o.matrix_world.copy()
        o.parent = arm; o.parent_type = 'OBJECT'
        o.matrix_parent_inverse = arm.matrix_world.inverted()
        o.matrix_world = world
        assert any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers), o.name
    update()
    print('BIND', arm.name, 'scale', list(arm.scale), 'meshParents',
          {o.name:o.parent.name for o in objects}, flush=True)
    return arm, objects, body

class Rig:
    def __init__(self, arm): self.arm=arm; self.pb=arm.pose.bones; self.bn=arm.data.bones
    def reset(self):
        for b in self.pb:
            b.rotation_mode='QUATERNION'; b.matrix_basis=Matrix.Identity(4)
        update()
    def head(self, name): update(); return self.arm.matrix_world@self.pb[name].head
    def axis(self, name): update(); b=self.pb[name]; return (self.arm.matrix_world.to_3x3()@(b.tail-b.head)).normalized()
    def turn(self, name, r):
        p=self.head(name); a=self.arm.matrix_world
        self.pb[name].matrix=a.inverted()@Matrix.Translation(p)@r.to_4x4()@Matrix.Translation(-p)@a@self.pb[name].matrix
        update()
    def aim(self, name, d): self.turn(name,self.axis(name).rotation_difference(Vector(d).normalized()).to_matrix())
    def ik(self, upper, lower, target, pole):
        """Analytic two-link IK, baked directly to FK rotations (no runtime constraint)."""
        h=self.head(upper); end=self.head(lower); u=(end-h).length
        tip = lower.replace('lowerarm_', 'hand_').replace('calf_', 'foot_')
        l=(self.head(tip)-end).length
        dv=target-h; assert dv.length > 1e-6, (upper, target)
        d=max(abs(u-l)+1e-5,min(dv.length,(u+l)*.9999)); e=dv.normalized()
        a=(u*u-l*l+d*d)/(2*d); height=math.sqrt(max(0,u*u-a*a))
        p=Vector(pole); p=p-p.project(e)
        assert p.length > 1e-6, ('degenerate IK pole', upper)
        p.normalize(); elbow=h+e*a+p*height
        self.aim(upper,elbow-h)
        # Set bend plane by twisting upper arm to align the lower segment.
        axis=self.axis(upper); cur=self.axis(lower); want=(target-self.head(lower)).normalized()
        c=cur-cur.project(axis); w=want-want.project(axis)
        if c.length>1e-6 and w.length>1e-6:
            c.normalize(); w.normalize()
            self.turn(upper,Quaternion(axis,math.atan2(axis.dot(c.cross(w)),c.dot(w))).to_matrix())
        self.aim(lower,target-self.head(lower))
        return (self.head(tip)-target).length
    def palm(self, side, direction, normal, curl=12):
        n='hand_'+side; bn=self.bn
        local=bn[n].matrix_local.to_3x3().inverted()
        d=(bn['middle_01_'+side].head_local-bn[n].head_local).normalized()
        a=bn['index_01_'+side].head_local-bn['pinky_01_'+side].head_local
        norm=(d.cross(a)*(1 if side=='l' else -1)).normalized()
        def frame(d,n):
            d=d.normalized(); n=(n-n.project(d)).normalized(); return Matrix((d,n,d.cross(n))).transposed()
        r=(self.arm.matrix_world@self.pb[n].matrix).to_3x3().normalized()
        self.turn(n,frame(Vector(direction),Vector(normal))@frame(r@local@d,r@local@norm).transposed())
        for digit in ('index','middle','ring','pinky'):
            for j in range(1,4):
                p=self.pb[f'{digit}_0{j}_{side}']; p.rotation_mode='QUATERNION'
                p.rotation_quaternion=Quaternion((1,0,0),math.radians(curl))
        update()
    def snapshot(self): return {b.name:b.matrix_basis.copy() for b in self.pb}
    def restore(self, pose):
        for n,m in pose.items(): self.pb[n].matrix_basis=m.copy()
        update()
    def mirror(self):
        bpy.ops.object.select_all(action='DESELECT'); self.arm.select_set(True); bpy.context.view_layer.objects.active=self.arm
        bpy.ops.object.mode_set(mode='POSE'); bpy.ops.pose.select_all(action='SELECT')
        bpy.ops.pose.copy(); bpy.ops.pose.paste(flipped=True); bpy.ops.object.mode_set(mode='OBJECT'); update()
    def key(self, f, clip):
        # Never leave an action active while authoring the next pose: depsgraph
        # updates can otherwise restore its frame-1 transforms during the solve.
        select_action(self.arm, clip)
        for b in self.pb:
            b.keyframe_insert('location',frame=f,group=b.name)
            b.keyframe_insert('rotation_quaternion',frame=f,group=b.name)
        self.arm.keyframe_insert('location',frame=f)
        self.arm.keyframe_insert('rotation_quaternion',frame=f)
        self.arm.animation_data.action=None

def vertices(objects):
    dg=bpy.context.evaluated_depsgraph_get(); dg.update(); points=[]
    for o in objects:
        ev=o.evaluated_get(dg); me=ev.to_mesh()
        points.extend(ev.matrix_world@v.co for v in me.vertices); ev.to_mesh_clear()
    assert points, 'No evaluated mesh vertices'
    return points

def select_action(arm, clip):
    arm.animation_data_create(); arm.animation_data.action=clip
    if hasattr(clip, 'slots') and len(clip.slots):
        arm.animation_data.action_slot=clip.slots[0]

def skin_low(body): return min(p.z for p in vertices([body]))

def weighted_ids(obj, names, threshold=.5):
    groups={obj.vertex_groups[n].index for n in names if n in obj.vertex_groups}
    ids=[v.index for v in obj.data.vertices
         if sum(g.weight for g in v.groups if g.group in groups)>threshold]
    assert ids, ('No weighted surface vertices', obj.name, names)
    return ids

def evaluated_points(obj, ids):
    update(); dg=bpy.context.evaluated_depsgraph_get(); ev=obj.evaluated_get(dg); me=ev.to_mesh()
    try: return [ev.matrix_world@me.vertices[i].co for i in ids]
    finally: ev.to_mesh_clear()

def action(arm, name):
    arm.animation_data_create(); arm.animation_data.action=None
    a=bpy.data.actions.new(name); a.use_fake_user=True
    return a

def validate_actions(arm, names):
    for name in names:
        a=bpy.data.actions.get(name)
        assert a is not None and a.use_fake_user, ('Missing persistent action', name)
        print('BLEND_ACTION', arm.name, name, 'frames', list(a.frame_range),
              'seconds', (a.frame_range[1]-a.frame_range[0])/FPS, 'fakeUser', a.use_fake_user, flush=True)

def verify_export(path, names):
    """Run only AFTER saving the .blend; reimport into an empty scene/process state."""
    import struct
    blob=Path(path).read_bytes(); size=struct.unpack_from('<I',blob,12)[0]
    gltf=json.loads(blob[20:20+size]); animations=gltf.get('animations',[])
    actual=[a.get('name') for a in animations]
    print('GLTF_ANIMATIONS', path, actual, flush=True)
    assert set(actual)==set(names), ('Export lost clips', actual, names)
    for a in animations:
        times=[gltf['accessors'][s['input']] for s in a['samplers']]
        duration=max(t['max'][0] for t in times)-min(t['min'][0] for t in times)
        expected=1.6 if a['name'].startswith(('roll','walk')) else 1
        assert abs(duration-expected)<.002, (a['name'], duration)
        print('GLTF_DURATION',a['name'],duration,flush=True)
    for n in gltf['nodes']:
        assert all(s>0 for s in n.get('scale',[1,1,1])), ('Nonpositive scale',n.get('name'))
    blend=Path(path).parent/('patient.blend' if names==PATIENT_CLIPS else 'therapist.blend')
    bpy.ops.wm.open_mainfile(filepath=str(blend))
    saved=[a.name for a in bpy.data.actions]
    print('SAVED_BLEND_ACTIONS',str(blend),saved,flush=True)
    assert set(names)<=set(saved) and all(bpy.data.actions[n].use_fake_user for n in names), saved
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps=FPS
    bpy.ops.import_scene.gltf(filepath=str(path))
    imported=[a.name for a in bpy.data.actions]
    print('REIMPORT_ANIMATIONS', imported, flush=True)
    assert len(imported)==len(names) and all(any(n==a or a.endswith('|'+n) for a in imported) for n in names), imported
    rigs=[o for o in bpy.data.objects if o.type=='ARMATURE']
    meshes=[o for o in bpy.data.objects if o.type=='MESH']
    print('REIMPORT_METRICS',Path(path).stat().st_size,'bytes',
          sum(len(o.data.bones) for o in rigs),'bones',len(meshes),'meshes',
          sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes),'triangles',flush=True)
    assert len(rigs)==1 and len(rigs[0].data.bones)>=50, 'Lost MPFB rig'
    arm=rigs[0]; sc=bpy.context.scene
    skin=next(o for o in meshes if o.name=='side_skin')
    shoes=next(o for o in meshes if 'shoes05' in o.name.lower())
    for name in names:
        clip=next(a for a in bpy.data.actions if a.name==name or a.name.endswith('|'+name))
        select_action(arm,clip)
        if name.startswith('walk'): continue
        first,last=(round(f) for f in clip.frame_range)
        frames=range(first,last+1) if name.startswith('roll') else (first,last)
        for frame in frames:
            sc.frame_set(frame); update()
            if name.startswith(('lie','roll')):
                low=skin_low(skin)
                print('REIMPORT_SUPPORT',name,frame,'lowestSkinY',low,flush=True)
                assert abs(low-.81)<.015 if name.startswith('lie') else low>=.80, (name,frame,low)
            else:
                feet={sd:min(p.z for p in evaluated_points(shoes,weighted_ids(shoes,['foot_'+sd,'ball_'+sd]))) for sd in 'lr'}
                print('REIMPORT_SUPPORT',name,frame,'shoeLowestY',feet,flush=True)
                assert all(abs(y)<.02 for y in feet.values()), (name,frame,feet)

def export(arm, objects, path, extra=()):
    bpy.ops.object.select_all(action='DESELECT')
    for o in [arm]+objects+list(extra): o.select_set(True)
    bpy.context.view_layer.objects.active=arm
    options=dict(filepath=str(path),export_format='GLB',use_selection=True,
        export_skins=True,export_animations=True,export_animation_mode='ACTIONS',
        export_force_sampling=True,export_frame_range=False,export_anim_slide_to_zero=True,
        export_def_bones=False,export_morph=False,export_apply=False,export_yup=True,
        export_extras=True,export_image_format='AUTO')
    supported=bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    bpy.ops.export_scene.gltf(**{k:v for k,v in options.items() if k in supported})
    print('WROTE',path,Path(path).stat().st_size,flush=True)

def patient(output, marks_path, work):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    arm,objects,body=character(); r=Rig(arm); r.reset()
    # Author L in the upright rig's symmetric local space, then use Blender pose mirror.
    pelvis=r.head('pelvis'); chest=r.head('spine_03')
    native_down=(pelvis-chest).normalized()
    for sd,s in (('l',1),('r',-1)):
        wrist=Vector((-s*.105,-.205,chest.z-.015+(sd=='l')*.045))
        r.ik('upperarm_'+sd,'lowerarm_'+sd,wrist,Vector((s,-.25,-.6)))
        r.palm(sd,Vector((-s*.85,0,.40)),Vector((0,1,0)),14)
    # Native +X = left (down in lieL), -Y = anterior, -Z = feet.
    # Initial segment directions, then fitted below to hip 65 / knee 90 degrees.
    # Adduction lowers the knee to the front edge; the returning calf tucks
    # the shoe by the bottom knee instead of extending a second straight leg.
    r.aim('thigh_r',Vector((.65,-.68,-.34)))
    r.aim('calf_r',Vector((-.38,.35,-.85)))
    r.aim('foot_r',Vector((0,-.9,-.15)))
    r.aim('thigh_l',Vector((-.025,-.015,-1)))
    r.aim('calf_l',Vector((0,.015,-1)))
    r.aim('foot_l',Vector((0,-.95,-.12)))
    # Ease bottom shoulder forward so it is visible instead of trapped below chest.
    r.turn('clavicle_l',Matrix.Rotation(math.radians(-9),3,'Z'))
    poseL=r.snapshot()
    # A proper rotation: left +X down, front -Y toward world +x, crown toward -z.
    base=Matrix(((0,-1,0),(0,0,1),(-1,0,0))).to_quaternion()
    restHip=arm.data.bones['pelvis'].head_local.copy()
    arm.rotation_mode='QUATERNION'
    def placement(t, pose=None):
        if pose is not None: r.restore(pose)
        # Half turn through supine: lieL front +x -> front +y -> lieR front -x.
        q=Quaternion((0,1,0),-math.pi*t)@base
        arm.rotation_quaternion=q
        update()
        # Bone heads are armature-local. Include the actual MPFB object scale.
        arm.location=B3(0,1.05,.40)-arm.matrix_world.to_3x3()@restHip
        update()
        # Visible SKIN is the support reference, not hair, clothes, shoes or
        # helper geometry. One centimetre of pad compression; full rig follows.
        arm.location.z+=SKIN_REST-skin_low(body)
        update()
    # Fit the upper knee to the actual compressed body height, rather than
    # assuming every MPFB body has the same torso width. Retain 65-degree hip
    # flexion while changing adduction; the lower leg stays long on the pad.
    placement(0,poseL)
    anterior=Vector((0,-1,0)); anterior=(anterior-anterior.project(native_down)).normalized()
    flex=math.cos(math.radians(65))
    for iteration in range(3):
        hip=r.head('thigh_r'); length=(r.head('calf_r')-hip).length
        dx=(hip.z-.89)/length
        assert .25<dx<.84, ('Upper knee cannot reach pad with this body',dx,T3(hip),length)
        direction=Vector((dx,0,0))+native_down*flex+anterior*math.sqrt(1-dx*dx-flex*flex)
        r.aim('thigh_r',base@direction)
        calf=Vector((-.38,.35,-.85))
        calf=(calf-calf.project(direction)).normalized()
        r.aim('calf_r',base@calf)  # exactly 90 degrees, returning behind the lower knee
        r.aim('foot_r',base@Vector((0,-.9,-.15)))
        placement(0)
        print('PATIENT_KNEE_FIT',iteration,'adductionComponent',dx,
              'topKnee',T3(r.head('calf_r')),'lowestSkinY',skin_low(body),flush=True)
    poseL=r.snapshot(); r.mirror(); poseR=r.snapshot()
    metrics=[]; markers={}; empties=[]
    def measure(clip, frame):
        low=skin_low(body)
        row={'clip':clip,'frame':frame,'lowestSkinY':round(low,7),
             'lowestAllY':round(min(p.z for p in vertices(objects)),7)}
        if clip in ('lieL','lieR'):
            assert abs(low-.81)<.015, row
            top='r' if clip=='lieL' else 'l'; bottom='l' if top=='r' else 'r'
            hip=r.head('thigh_'+top); knee=r.head('calf_'+top); foot=r.head('foot_'+top)
            down=(r.head('pelvis')-r.head('spine_03')).normalized()
            row.update(topHipFlexDegrees=round(math.degrees((knee-hip).angle(down)),3),
                       topKneeFlexDegrees=round(math.degrees((knee-hip).angle(foot-knee)),3),
                       bottomKneeFlexDegrees=round(math.degrees(r.axis('thigh_'+bottom).angle(r.axis('calf_'+bottom))),3),
                       topKnee=T3(knee),topFoot=T3(foot),bottomKnee=T3(r.head('calf_'+bottom)))
            assert 60<row['topHipFlexDegrees']<76, row
            assert 85<row['topKneeFlexDegrees']<95, row
            assert row['bottomKneeFlexDegrees']<15, row
            # Centre just inside/over the front edge; trouser surface rests
            # on the pad. A high knee must not pass only because a hand is low.
            assert .20<abs(knee.x)<.42 and .84<knee.z<.98, row
        else: assert low>=.80, row
        metrics.append(row); print('PATIENT_SUPPORT',json.dumps(row),flush=True)
    def make_marks(side,pose,t):
        placement(t,pose)
        # Ray cast from above onto garment; target is the upper shoulder / iliac region.
        points=[]; faces=[]; dg=bpy.context.evaluated_depsgraph_get()
        for o in objects:
            if o.name not in ('side_skin','side_shirt','side_jeans'): continue
            ev=o.evaluated_get(dg); me=ev.to_mesh(); off=len(points)
            points += [ev.matrix_world@v.co for v in me.vertices]
            faces += [[off+i for i in p.vertices] for p in me.polygons]; ev.to_mesh_clear()
        tree=BVHTree.FromPolygons(points,faces)
        def surface(p):
            hit=tree.ray_cast(Vector((p.x,p.y,2)),Vector((0,0,-1)))
            assert hit[0] is not None, ('No contact surface', side, T3(p))
            return hit[0]
        top='r' if side=='L' else 'l'
        shoulder=surface(r.head('upperarm_'+top)+B3(.025 if side=='L' else -.025,0,.005))
        hip=surface(r.head('thigh_'+top)+B3(-.015 if side=='L' else .015,0,-.055))
        # Posterior midline at L4/5, from the actual skin/garment surface.
        sp=r.head('spine_01'); posterior=B3(-1 if side=='L' else 1,0,0)
        start=sp+posterior*.5; hit=tree.ray_cast(start,-posterior)
        l4=hit[0] if hit[0] is not None else sp+posterior*.13
        result={}
        for nm,p in (('l4',l4),('shoulder',shoulder),('hip',hip)):
            name=f'mark_{nm}_{side}'; e=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(e); e.location=p
            empties.append(e); result[name]=T3(p)
        result['top_knee']=T3(r.head('calf_'+top))
        knee=r.head('calf_'+top); facing=B3(1 if side=='L' else -1,0,0)
        knee_hit=tree.ray_cast(knee+facing*.5,-facing)
        assert knee_hit[0] is not None, ('No top knee garment surface', side)
        result['top_knee_surface']=T3(knee_hit[0])
        result['facing']=[1 if side=='L' else -1,0,0]
        # Runtime post-multiplied bone quaternions need axes in each bone's
        # own frame, not a guessed global/local X. Positive turns toward doctor.
        roll_axis=B3(0,0,-1 if side=='L' else 1)
        result['pelvisRollAxesLocal']={n:[round(x,7) for x in
            ((arm.matrix_world@r.pb[n].matrix).to_3x3().inverted()@roll_axis).normalized()]
            for n in ('pelvis','spine_01','spine_02','spine_03','thigh_l','thigh_r')}
        return result
    markers['lieL']=make_marks('L',poseL,0); markers['lieR']=make_marks('R',poseR,1)
    sc=bpy.context.scene; sc.render.fps=FPS; sc.frame_start=1; sc.frame_end=49
    for name,pose,t in [('lieL',poseL,0),('lieR',poseR,1)]:
        clip=action(arm,name)
        for f in (1,31):
            placement(t,pose); measure(name,f); r.key(f,clip)
    for name,reverse in [('rollLR',False),('rollRL',True)]:
        clip=action(arm,name)
        for f in range(49):
            u=f/48; t=1-u if reverse else u; blend=t*t*(3-2*t)
            for b in r.pb:
                l=poseL[b.name]; rr=poseR[b.name]
                b.matrix_basis=Matrix.LocRotScale(l.to_translation().lerp(rr.to_translation(),blend),l.to_quaternion().slerp(rr.to_quaternion(),blend),Vector((1,1,1)))
            placement(blend); measure(name,1+f); r.key(1+f,clip)
    # Default displayed pose is L, while original MPFB bind matrices are untouched.
    select_action(arm,bpy.data.actions['lieL']); sc.frame_set(1); update()
    # Verify the evaluated actions, not merely the poses before key insertion.
    for name in PATIENT_CLIPS:
        select_action(arm,bpy.data.actions[name])
        for f in ([1,31] if name.startswith('lie') else range(1,50)):
            sc.frame_set(f); update(); measure(name,f)
    select_action(arm,bpy.data.actions['lieL']); sc.frame_set(1)
    data={'frame':'three.js metres: +y up, head -z','tableTop':TABLE,'clips':markers,
          'duration':{'lieL':1,'lieR':1,'rollLR':1.6,'rollRL':1.6},'supportMetrics':metrics}
    Path(marks_path).write_text(json.dumps(data,ensure_ascii=False,indent=2))
    export(arm,objects,output,empties)
    validate_actions(arm,PATIENT_CLIPS)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(work)/'patient.blend'))
    print('PATIENT_MARKS',json.dumps(markers),flush=True)
    verify_export(output,PATIENT_CLIPS)

if __name__=='__main__':
    args=sys.argv[sys.argv.index('--')+1:]
    patient(args[0],args[1],args[2] if len(args)>2 else str(Path(args[0]).parent))
