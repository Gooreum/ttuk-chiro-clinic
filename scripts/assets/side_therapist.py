"""Skinned MPFB therapist, contact IK baked against side patient's surface markers.
blender -b --python side_therapist.py -- WORK/therapist_raw.glb patient_marks.json WORK
Optional --preview WORK OUT imports the saved work scenes and renders required frames.
"""
import bpy, sys, math, json
from pathlib import Path
from mathutils import Vector, Matrix, Quaternion
sys.path.insert(0,str(Path(__file__).resolve().parent))
from side_patient import (B3,T3,update,character,Rig,action,export,vertices,FPS,
    weighted_ids,evaluated_points,select_action,validate_actions,verify_export,
    PATIENT_CLIPS,THERAPIST_CLIPS,skin_low)

def palm_patch(body, r, sd):
    """Fixed rest-mesh IDs on the palmar metacarpals; never choose by target proximity."""
    hand=r.head('hand_'+sd); d=(r.head('middle_01_'+sd)-hand).normalized()
    across=r.head('index_01_'+sd)-r.head('pinky_01_'+sd)
    n=(d.cross(across)*(1 if sd=='l' else -1)).normalized()
    ids=weighted_ids(body,['hand_'+sd],.65)
    pts=evaluated_points(body,ids)
    candidates=[(i,p) for i,p in zip(ids,pts)
                if .025<(p-hand).dot(d)<.070 and abs((p-hand).dot(across.normalized()))<.025]
    assert candidates, ('No metacarpal skin patch',sd)
    outer=max((p-hand).dot(n) for _,p in candidates)
    result=[i for i,p in candidates if (p-hand).dot(n)>outer-.006]
    assert len(result)>=3, ('Too few palm skin vertices',sd,result)
    print('PALM_PATCH',sd,'vertexIds',result,'count',len(result),flush=True)
    return result


def therapist(output, marks_file, work):
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
    marks=json.loads(Path(marks_file).read_text())['clips']
    arm,objects,body=character(True); r=Rig(arm); r.reset()
    # Select skin/sole samples in REST space, before IK and before root movement.
    patches={sd:palm_patch(body,r,sd) for sd in 'lr'}
    shoes=next(o for o in objects if 'shoes05' in o.name.lower())
    soles={sd:weighted_ids(shoes,['foot_'+sd,'ball_'+sd],.5) for sd in 'lr'}
    jeans=next(o for o in objects if o.name=='side_jeans')
    # MPFB's garment mask removes covered skin: measure the actual jeans surface.
    thigh_ids={sd:weighted_ids(jeans,['thigh_'+sd],.65) for sd in 'lr'}
    arm.rotation_mode='QUATERNION'
    arm.rotation_quaternion=Quaternion((0,0,1),-math.pi/2)
    update()
    knee=B3(*marks['lieL']['top_knee'])
    hip_anchor=B3(max(.44,knee.x+.12),.91,-knee.y-.11)
    arm.location+=hip_anchor-r.head('pelvis'); update()
    # Positive hinge about world +z (three): upright spine leans toward -x.
    for n,deg in [('pelvis',35),('spine_01',3),('spine_02',2),('spine_03',2)]:
        r.turn(n,Quaternion(B3(0,0,1),math.radians(deg)).to_matrix())
    # Adding local joint angles does not equal a measured trunk angle. Fit the
    # pelvis-to-shoulder chord to 40 degrees before solving the planted legs.
    trunk=(r.head('upperarm_l')+r.head('upperarm_r'))/2-r.head('pelvis')
    # The hips stay by the bent knee, while the torso also leans headward.
    # This brings the front UPPER thigh to knee height instead of reaching
    # forward only with the low knee and leaving a gap beside the patient.
    want=B3(-.8*math.sin(math.radians(40)),math.cos(math.radians(40)),
            -.6*math.sin(math.radians(40)))
    r.turn('pelvis',trunk.normalized().rotation_difference(want).to_matrix())
    print('TRUNK_TARGET',40,'pelvisAnchor',T3(r.head('pelvis')),flush=True)
    # Front upper thigh is beside the patient's top knee; the rear foot opens
    # toward the head end. Both ankles are solved independently with flat soles.
    def plant(sd, target, inward):
        ankle=target.copy()
        for iteration in range(12):
            error=r.ik('thigh_'+sd,'calf_'+sd,ankle,B3(inward,0,0))
            r.aim('foot_'+sd,B3(inward,0,0))
            low=min(p.z for p in evaluated_points(shoes,soles[sd]))
            if abs(low)<.0008: break
            ankle.z-=low
        return error
    for sd,x,z in [('l',hip_anchor.x+.015,-knee.y),('r',hip_anchor.x+.18,-hip_anchor.y-.30)]:
        err=plant(sd,B3(x,.10,z),-1)
        print('FOOT_SOLVE',sd,'ankleErrorMetres',err,flush=True)
    contact={}
    def solve_hands(side):
        # Mirrored pose is refined against the independently measured R targets.
        sign=1 if side=='L' else -1
        assignment=[('r','shoulder'),('l','hip')] if side=='L' else [('l','shoulder'),('r','hip')]
        for sd,nm in assignment:
            target=B3(*marks['lie'+side][f'mark_{nm}_{side}'])
            d=B3(-.35*sign,0,1 if nm=='shoulder' else -.85).normalized()
            normal=B3(0,-1,0)
            wrist=target-d*.05-normal*.02
            for iteration in range(20):
                err=r.ik('upperarm_'+sd,'lowerarm_'+sd,wrist,B3(.6*sign,.05,-.65 if nm=='shoulder' else .65))
                r.palm(sd,d,normal,8)
                points=evaluated_points(body,patches[sd])
                measured=sum(points,Vector())/len(points)
                delta=target-measured
                if delta.length<.002: break
                wrist+=delta*.85
            print('CONTACT_SOLVE',side,nm,'iterations',iteration+1,
                  'measuredPalm',T3(measured),'target',T3(target),
                  'errorMetres',delta.length,'ikWristError',err,flush=True)
        for n,deg in [('neck_01',6),('head',4)]:
            r.turn(n,Quaternion(B3(0,0,sign),math.radians(deg)).to_matrix())
    solve_hands('L')
    poseL=r.snapshot(); rootL=(arm.location.copy(),arm.rotation_quaternion.copy())
    r.mirror(); poseR=r.snapshot()
    rootR=(Vector((-rootL[0].x,rootL[0].y,rootL[0].z)),Quaternion((0,0,1),math.pi/2))
    arm.location,arm.rotation_quaternion=rootR
    r.restore(poseR); update()
    for sd in 'lr':
        foot=r.head('foot_'+sd)
        plant(sd,foot,1)
    solve_hands('R'); poseR=r.snapshot()
    def setup(side):
        arm.location,arm.rotation_quaternion=rootL if side=='L' else rootR
        r.restore(poseL if side=='L' else poseR); update()
    failures=[]
    def measure(side,frame):
        sign=1 if side=='L' else -1
        feet={sd:min(p.z for p in evaluated_points(shoes,soles[sd])) for sd in 'lr'}
        pelvis=r.head('pelvis'); shoulder=(r.head('upperarm_l')+r.head('upperarm_r'))/2
        trunk=shoulder-pelvis
        lean=math.degrees(trunk.angle(B3(0,1,0)))
        head=r.head('head'); patient_shoulder=B3(*marks['lie'+side]['mark_shoulder_'+side])
        front='l' if side=='L' else 'r'
        knee=B3(*marks['lie'+side]['top_knee'])
        knee_surface=B3(*marks['lie'+side]['top_knee_surface'])
        thigh=evaluated_points(jeans,thigh_ids[front])
        near=min(thigh,key=lambda p:(p-knee_surface).length)
        thigh_gap=(near-knee_surface).length
        row={'clip':'setup'+side,'frame':frame,'shoeLowestY':feet,
             'pelvis':T3(pelvis),'head':T3(head),'trunkLeanDegrees':lean,
             'headAbovePatientShoulderMetres':head.z-patient_shoulder.z,
             'patientTopKnee':T3(knee),'measuredThighJeans':T3(near),
             'patientTopKneeSurface':T3(knee_surface),
             'thighToKneeCentreMetres':(near-knee).length,
             'thighSurfaceGapMetres':thigh_gap,'contacts':{}}
        assignment=[('r','shoulder'),('l','hip')] if side=='L' else [('l','shoulder'),('r','hip')]
        for sd,nm in assignment:
            pts=evaluated_points(body,patches[sd]); measured=sum(pts,Vector())/len(pts)
            target=B3(*marks['lie'+side][f'mark_{nm}_{side}'])
            error=(measured-target).length
            row['contacts'][nm]={'hand':sd,'vertexIds':patches[sd],
                'palm':T3(measured),'target':T3(target),'errorMetres':error,
                'nearestPatchVertexErrorMetres':min((p-target).length for p in pts)}
            if error>.01: failures.append(('palm',side,nm,error))
        if any(abs(y)>=.02 for y in feet.values()): failures.append(('feet',side,feet))
        if not 35<=lean<=45: failures.append(('lean',side,lean))
        if head.z<patient_shoulder.z+.08: failures.append(('head too low',side,T3(head)))
        if sign*pelvis.x<.31: failures.append(('hips inside table',side,T3(pelvis)))
        if thigh_gap>.04: failures.append(('thigh misses patient knee',side,thigh_gap))
        contact.setdefault('setup'+side,[]).append(row)
        print('THERAPIST_SUPPORT',json.dumps(row),flush=True)
    sc=bpy.context.scene; sc.render.fps=FPS; sc.frame_start=1; sc.frame_end=49
    for name,side in [('setupL','L'),('setupR','R')]:
        clip=action(arm,name)
        for f in (1,31): setup(side); r.key(f,clip)
    # Foot-end route clears a 0.62 x 1.90 m pad, z -0.30..1.60.
    def path(t):
        x=rootL[0].x; z=-rootL[0].y
        pts=[(0,x,z),(.20,.78,.78),(.38,.72,1.92),(.50,0,2.05),(.62,-.72,1.92),(.80,-.78,.78),(1,-x,z)]
        for i in range(len(pts)-1):
            a,x,z=pts[i]; b,xx,zz=pts[i+1]
            if t<=b:
                u=(t-a)/(b-a); return Vector((x+(xx-x)*u,z+(zz-z)*u))
        return Vector((-rootL[0].x,-rootL[0].y))
    for name,rev in [('walkLR',False),('walkRL',True)]:
        clip=action(arm,name)
        for f in range(49):
            t=f/48; u=1-t if rev else t
            if f in (0,48):
                setup('L' if u==0 else 'R'); r.key(f+1,clip); continue
            release=min(1,u/.18); catch=max(0,(u-.82)/.18)
            frompose=poseL if u<.5 else poseR
            weight=1-release if u<.5 else catch
            for b in r.pb:
                m=frompose[b.name]
                b.matrix_basis=Matrix.LocRotScale(m.to_translation()*weight,Quaternion().slerp(m.to_quaternion(),weight),Vector((1,1,1)))
            p=path(u); tangent=path(min(1,u+.005))-path(max(0,u-.005))
            travel=Vector((tangent.x,-tangent.y,0)).normalized()
            walkq=Vector((0,-1,0)).rotation_difference(travel)
            if u<.16: q=rootL[1].slerp(walkq,u/.16)
            elif u>.84: q=walkq.slerp(rootR[1],(u-.84)/.16)
            else: q=walkq
            arm.rotation_quaternion=q
            arm.location=B3(p.x,rootL[0].z,p.y)
            stride=math.sin(u*math.pi*8)*math.radians(22)*(1-weight)
            for sd,s in [('l',1),('r',-1)]:
                r.pb['thigh_'+sd].rotation_quaternion @= Quaternion((1,0,0),stride*s)
                r.pb['calf_'+sd].rotation_quaternion @= Quaternion((1,0,0),max(0,-stride*s)*1.2)
            update(); low=min(p.z for p in vertices([shoes])); arm.location.z-=low
            r.key(f+1,clip)
    # Re-evaluate saved keys; report actual mesh skin after the complete pose.
    for name,side in [('setupL','L'),('setupR','R')]:
        select_action(arm,bpy.data.actions[name])
        for f in (1,31): sc.frame_set(f); update(); measure(side,f)
    Path(work,'contact_metrics.json').write_text(json.dumps(contact,indent=2))
    print('POSE_FAILURES',json.dumps(failures),flush=True)
    assert not failures, failures
    select_action(arm,bpy.data.actions['setupL']); sc.frame_set(1)
    export(arm,objects,output)
    validate_actions(arm,THERAPIST_CLIPS)
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(work)/'therapist.blend'))
    verify_export(output,THERAPIST_CLIPS)

def preview(work,out):
    """CPU Cycles also works on hosts where Metal / Workbench is unavailable."""
    work=Path(work); out=Path(out); out.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=str(work/'patient.blend'))
    patient_actions={n:bpy.data.actions[n] for n in PATIENT_CLIPS}
    with bpy.data.libraries.load(str(work/'therapist.blend'),link=False) as (src,dst):
        assert set(THERAPIST_CLIPS)<=set(src.actions), ('Missing saved therapist clips',src.actions)
        dst.objects=src.objects
        # Fake users preserve unused actions in the file; library append must
        # explicitly request them too, not only the active object's dependencies.
        dst.actions=list(THERAPIST_CLIPS)
    for o in dst.objects:
        if o: bpy.context.collection.objects.link(o)
    patient=next(o for o in bpy.data.objects if o.type=='ARMATURE' and 'patient' in o.name)
    therapist=next(o for o in bpy.data.objects if o.type=='ARMATURE' and 'therapist' in o.name)
    therapist_actions={n:a for n,a in zip(THERAPIST_CLIPS,dst.actions)}
    validate_actions(patient,PATIENT_CLIPS); validate_actions(therapist,THERAPIST_CLIPS)
    patient_skin=next(o for o in patient.children if o.type=='MESH' and 'skin' in o.name)
    therapist_shoes=next(o for o in therapist.children if o.type=='MESH' and 'shoes05' in o.name.lower())
    sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=20
    sc.render.resolution_x=1200; sc.render.resolution_y=720; sc.render.resolution_percentage=100
    sc.world.color=(.22,.26,.24)
    def material(n,c):
        m=bpy.data.materials.new(n); m.diffuse_color=(*c,1); return m
    def cube(n,pos,scale,mat):
        bpy.ops.mesh.primitive_cube_add(size=1,location=B3(*pos)); o=bpy.context.object; o.name=n; o.scale=(scale[0],scale[2],scale[1]); o.data.materials.append(mat)
        b=o.modifiers.new('soft edge','BEVEL'); b.width=.025; b.segments=3
    cube('preview pad',(0,.77,.65),(.62,.10,1.90),material('pad',(.025,.065,.052)))
    print('PREVIEW_TABLE',json.dumps({'top':.82,'width':.62,'length':1.90,
          'x':[-.31,.31],'z':[-.30,1.60]}),flush=True)
    cube('table pedestal',(0,.39,.60),(.35,.70,.9),material('base',(.14,.20,.17)))
    cube('floor',(0,-.025,.7),(8,.05,8),material('floor',(.16,.20,.18)))
    bpy.ops.object.light_add(type='AREA',location=B3(-1.5,4,-1)); key=bpy.context.object; key.data.energy=500; key.data.shape='DISK'; key.data.size=4
    bpy.ops.object.light_add(type='AREA',location=B3(2,3,1)); bpy.context.object.data.energy=350; bpy.context.object.data.size=3
    bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=3.7
    def camera(side=1,far=False):
        look=B3(0,1.04,.53); pos=look+B3(-side*2.8,math.tan(math.radians(40))*math.hypot(2.8,1.7),1.7)
        cam.location=pos; cam.rotation_euler=(look-pos).to_track_quat('-Z','Y').to_euler(); cam.data.ortho_scale=4.5 if far else 3.7
    def render(name):
        sc.render.filepath=str(out/(name+'.png')); bpy.ops.render.render(write_still=True)
    for side in 'LR':
        select_action(patient,patient_actions['lie'+side])
        select_action(therapist,therapist_actions['setup'+side])
        sc.frame_set(1); update()
        low=skin_low(patient_skin); print('PREVIEW_SUPPORT','lie'+side,low,flush=True)
        assert abs(low-.81)<.015, ('preview patient floats','lie'+side,low)
        feet={sd:min(p.z for p in evaluated_points(therapist_shoes,
              weighted_ids(therapist_shoes,['foot_'+sd,'ball_'+sd]))) for sd in 'lr'}
        print('PREVIEW_FEET','setup'+side,feet,flush=True)
        assert all(abs(y)<.02 for y in feet.values()), ('preview therapist floats',side,feet)
        camera(1 if side=='L' else -1); render('setup'+side)
    select_action(patient,patient_actions['rollLR']); select_action(therapist,therapist_actions['walkLR'])
    for i,t in enumerate([0,.4,.8,1.2,1.6]):
        sc.frame_set(round(t*30)+1); update()
        low=skin_low(patient_skin); print('PREVIEW_SUPPORT','rollLR',t,low,flush=True)
        assert low>=.80, ('preview patient below pad',t,low)
        camera(1 if t<.8 else -1,True); render('roll_'+str(i))
    bpy.ops.wm.open_mainfile(filepath=str(work/'lumbar.blend'))
    sc=bpy.context.scene; sc.render.engine='CYCLES'; sc.cycles.device='CPU'; sc.cycles.samples=32
    sc.render.resolution_x=900; sc.render.resolution_y=1000; sc.render.resolution_percentage=100; sc.world.color=(.13,.18,.16)
    bpy.ops.object.light_add(type='AREA',location=(.15,-.25,.4)); bpy.context.object.data.energy=25; bpy.context.object.data.size=.3
    bpy.ops.object.light_add(type='AREA',location=(-.2,.25,.15)); bpy.context.object.data.energy=20; bpy.context.object.data.size=.25
    bpy.ops.object.camera_add(); cam=bpy.context.object; sc.camera=cam; cam.data.type='ORTHO'; cam.data.ortho_scale=.37
    for name,pos in [('lumbar_front',(.02,.55,.04)),('lumbar_back_oblique',(.30,-.48,.20))]:
        look=Vector((0,0,.015)); cam.location=pos; cam.rotation_euler=(look-cam.location).to_track_quat('-Z','Y').to_euler()
        sc.render.filepath=str(out/(name+'.png')); bpy.ops.render.render(write_still=True)

if __name__=='__main__':
    a=sys.argv[sys.argv.index('--')+1:]
    if a[0]=='--preview': preview(a[1],a[2])
    else: therapist(a[0],a[1],a[2] if len(a)>2 else str(Path(a[0]).parent))
