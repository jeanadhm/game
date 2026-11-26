# Colonie Noire · modélisation de la fourmi dans Blender (script, aucune action manuelle)
# Usage : python build_ant.py <dossier_sortie>   (avec le module bpy : pip install bpy)
# Produit models/ant.glb (maillage organique + squelette + animations « walk » et « idle »)
# et models/vm.glb (mandibles et antennes vues à la première personne).
# Repère Blender : X droite, Y arrière (la tête regarde vers -Y), Z haut. Une fourmi mesure ~1,25 unité.
import bpy, bmesh, math, random, sys, os
from mathutils import Vector, Matrix, Quaternion, noise

OUT = sys.argv[-1] if len(sys.argv) > 1 and os.path.isdir(sys.argv[-1]) else os.path.join(os.path.dirname(__file__), '..', 'models')
random.seed(7)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 24


def material(name, color, rough):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Roughness'].default_value = rough
    return m


M_BODY = material('body', (.04, .025, .018), .3)
M_GASTER = material('gaster', (.03, .02, .015), .22)
M_LEG = material('leg', (.05, .035, .025), .42)
M_EYE = material('eye', (.01, .01, .012), .05)
M_WING = material('wing', (.85, .9, 1), .1)
PARTS = []


def finish(name, bm, mat, bone, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = smooth
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    PARTS.append(ob)
    return ob


def ellipsoid(name, bone, c, r, mat, segs=28, rings=18, deform=None, rough=0.0):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=rings, radius=1.0)
    for v in bm.verts:
        n = Vector((v.co.x, v.co.z, v.co.y))
        p = Vector((n.x * r[0], n.y * r[1], n.z * r[2]))
        if deform:
            p = deform(p)
        if rough:  # micro-relief de la chitine
            p += n * noise.noise(n * 9.0) * rough
        v.co = p + Vector(c)
    return finish(name, bm, mat, bone)


def tube(name, bone, pts, radii, mat, k=10):
    """Tube lisse qui suit une polyligne, rayon interpolé, extrémités fermées."""
    bm = bmesh.new()
    rings = []
    up0 = Vector((0, 0, 1))
    for i, p in enumerate(pts):
        p = Vector(p)
        d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        up = up0 if abs(d.dot(up0)) < .95 else Vector((1, 0, 0))
        a = d.cross(up).normalized(); b = d.cross(a).normalized()
        ring = []
        for j in range(k):
            t = j / k * math.tau
            ring.append(bm.verts.new(p + (a * math.cos(t) + b * math.sin(t)) * radii[i]))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(k):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % k], rings[i + 1][(j + 1) % k], rings[i + 1][j]))
    for ring, p, s in ((rings[0], pts[0], -1), (rings[-1], pts[-1], 1)):
        c = bm.verts.new(Vector(p) + (Vector(pts[-1]) - Vector(pts[0])).normalized() * s * radii[0 if s < 0 else -1] * .6)
        for j in range(k):
            f = (ring[j], ring[(j + 1) % k], c) if s > 0 else (ring[(j + 1) % k], ring[j], c)
            bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, bone)


def limb(name, bone, a, b, ra, rb, mat, bulge=0.0, n=7, k=10, bend=None):
    a, b = Vector(a), Vector(b)
    pts, radii = [], []
    for i in range(n + 1):
        t = i / n
        p = a.lerp(b, t)
        if bend:
            p += Vector(bend) * math.sin(math.pi * t)
        pts.append(p)
        radii.append((ra + (rb - ra) * t) * (1 + bulge * math.sin(math.pi * t)))
    return tube(name, bone, pts, radii, mat, k)


def mandible(name, bone, side, base):
    """Mandible courbe, aplatie, avec 5 dents sur le bord interne."""
    bm = bmesh.new()
    outline = []
    n = 18
    for i in range(n + 1):  # bord externe, de la base à la pointe
        t = i / n
        outline.append((t, .045 * (1 - t) ** .8 + .005))
    for i in range(n, -1, -1):  # bord interne avec dents
        t = i / n
        tooth = .012 * max(0, math.sin(t * math.pi * 5)) * (t > .2)
        outline.append((t, -.008 - tooth - .025 * (1 - t)))
    L = .21
    top, bot = [], []
    for (t, w) in outline:
        ang = -side * (t ** 1.3) * 1.05  # courbure vers l'intérieur
        x, y = w * side, -t * L
        cx, cy = x * math.cos(ang) - y * math.sin(ang), x * math.sin(ang) + y * math.cos(ang)
        th = .032 * (1 - t * .65)
        top.append(bm.verts.new(Vector(base) + Vector((cx, cy, th - t * .06))))
        bot.append(bm.verts.new(Vector(base) + Vector((cx, cy, -th - t * .06))))
    m = len(outline)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((top[i], top[j], bot[j], bot[i]))
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, M_LEG, bone, smooth=False)


def hairs(bone, center, radii, count, mat, side_only=False, length=.05):
    bm = bmesh.new()
    for _ in range(count):
        u, v = random.uniform(0, math.tau), random.uniform(-.2, 1)
        n = Vector((math.cos(u) * math.sqrt(1 - v * v), random.uniform(-1, 1) * .9, v)).normalized()
        p = Vector(center) + Vector((n.x * radii[0], n.y * radii[1], n.z * radii[2]))
        d = (n + Vector((0, .8, .2))).normalized()
        L = length * random.uniform(.6, 1.2)
        base = []
        a = d.cross(Vector((0, 0, 1))).normalized() if abs(d.z) < .9 else Vector((1, 0, 0))
        b = d.cross(a)
        for j in range(3):
            t = j / 3 * math.tau
            base.append(bm.verts.new(p + (a * math.cos(t) + b * math.sin(t)) * .0035))
        tip = bm.verts.new(p + d * L)
        for j in range(3):
            bm.faces.new((base[j], base[(j + 1) % 3], tip))
    return finish('hairs_' + bone, bm, mat, bone)


# ---------------------------------------------------------------- corps
# tête en forme de cœur (vue de dessus), plus large à l'arrière
def head_shape(p):
    k = (p.y / .2)
    p.x *= 1 + .16 * k
    p.y -= .045 * math.exp(-(p.x / .06) ** 2) * max(0, k)
    p.z *= 1 - .08 * max(0, -k)
    return p


HC = (0, -.37, .44)
ellipsoid('head', 'head', HC, (.2, .2, .165), M_BODY, 36, 24, head_shape, rough=.004)
ellipsoid('clypeus', 'head', (0, -.55, .4), (.1, .05, .05), M_BODY, 20, 12)
for s in (-1, 1):
    ellipsoid('eye', 'head', (s * .175, -.43, .47), (.045, .07, .055), M_EYE, 20, 14, rough=.006)
    ellipsoid('ocellus', 'head', (s * .03, -.33, .6), (.012, .012, .01), M_EYE, 8, 6)
    mandible('mand', 'mand.' + ('L' if s < 0 else 'R'), s, (s * .085, -.57, .37))
    # antennes : scape long puis fouet de 11 articles terminé en massue
    base, elbow = Vector((s * .07, -.5, .52)), Vector((s * .25, -.78, .68))
    limb('scape', 'scape.' + ('L' if s < 0 else 'R'), base, elbow, .016, .02, M_LEG, n=8, bend=(0, 0, .03))
    tip = Vector((s * .36, -1.12, .52))
    for i in range(11):
        t0, t1 = i / 11, (i + 1) / 11
        a = elbow.lerp(tip, t0); b = elbow.lerp(tip, t1)
        r = .013 + (.006 if i > 7 else 0) + i * .0004
        ellipsoid('flag', 'flag.' + ('L' if s < 0 else 'R'), (a + b) / 2, (r, (b - a).length * .7, r), M_LEG, 10, 8)

# mésosome bossu : pronotum, mésonotum, propodéum avec deux épines
ellipsoid('pronotum', 'thorax', (0, -.17, .43), (.115, .12, .105), M_BODY, 28, 18, rough=.004)
ellipsoid('mesonotum', 'thorax', (0, -.03, .4), (.1, .13, .095), M_BODY, 28, 18, rough=.004)
ellipsoid('propodeum', 'thorax', (0, .1, .37), (.09, .09, .085), M_BODY, 24, 16, rough=.004)
for s in (-1, 1):
    limb('spine', 'thorax', (s * .04, .13, .43), (s * .06, .2, .5), .018, .004, M_BODY, n=4, k=8)
# pétiole (écaille dressée) et gastre à quatre segments
limb('peduncle', 'petiole', (0, .16, .35), (0, .27, .35), .035, .032, M_BODY, n=4)
ellipsoid('petiole', 'petiole', (0, .22, .39), (.05, .035, .085), M_BODY, 18, 12)
for i, (y, rx, rz) in enumerate(((.38, .25, .22), (.5, .26, .225), (.62, .22, .19), (.72, .14, .12))):
    ellipsoid('tergite%d' % i, 'gaster', (0, y, .37 - i * .025), (rx, .15 if i < 3 else .1, rz), M_GASTER, 32, 20, rough=.003)
hairs('gaster', (0, .55, .36), (.25, .25, .21), 70, M_LEG)
hairs('head', HC, (.19, .19, .16), 24, M_LEG, length=.035)

# pattes : coxa, trochanter, fémur renflé, tibia avec éperon, tarse à 5 articles et griffes
LEGS = []
attach_y = (-.15, -.04, .07)
foot_dy = (-.38, -.02, .42)
knee_dy = (-.2, -.02, .24)
for s in (-1, 1):
    S = 'L' if s < 0 else 'R'
    for i in range(3):
        n = '%d.%s' % (i, S)
        ay = attach_y[i]
        A = Vector((s * .06, ay, .33))
        C = Vector((s * .12, ay + knee_dy[i] * .2, .27))
        K = Vector((s * .34, ay + knee_dy[i], .5))
        F = Vector((s * .52, ay + foot_dy[i] * .85, .1))
        FT = Vector((s * .62, ay + foot_dy[i], .0))
        limb('coxa', 'coxa' + n, A, C, .038, .03, M_LEG, n=4)
        limb('femur', 'femur' + n, C, K, .028, .024, M_LEG, bulge=.35, n=8)
        limb('tibia', 'tibia' + n, K, F, .022, .017, M_LEG, bulge=.1, n=8)
        limb('spur', 'tibia' + n, F, F + (FT - F).normalized() * .04 + Vector((0, 0, -.02)), .006, .002, M_LEG, n=2, k=6)
        for j in range(5):
            a, b = F.lerp(FT, j / 5), F.lerp(FT, (j + 1) / 5)
            ellipsoid('tarsus', 'tarsus' + n, (a + b) / 2, (.011 - j * .0008, (b - a).length * .62, .011 - j * .0008), M_LEG, 8, 6)
        for c in (-1, 1):
            limb('claw', 'tarsus' + n, FT, FT + Vector((c * .015, -.01 if i < 2 else .01, -.015)), .005, .001, M_LEG, n=2, k=5)
        LEGS.append(dict(n=n, s=s, i=i, A=A, C=C, K=K, F=F, FT=FT))

# ailes (cachées par défaut, affichées pour les Ailées et la reine)
WINGS = []
for s in (-1, 1):
    for k, (L, W, y) in enumerate(((.95, .22, -.1), (.7, .16, .02))):
        bm = bmesh.new()
        ring = []
        for j in range(24):
            t = j / 24 * math.tau
            x = (math.cos(t) * .5 + .5) * L
            w = math.sin(t) * W * (1 - .45 * (x / L) ** 2) * (1 if math.sin(t) > 0 else .7)
            ring.append(bm.verts.new(Vector((s * (x + .04), y + w * .2 + x * .55, .5 + x * .05))))
        bm.faces.new(ring)
        ob = finish('wing', bm, M_WING, 'wing%d.%s' % (k, 'L' if s < 0 else 'R'), smooth=False)
        WINGS.append(ob)

# ---------------------------------------------------------------- squelette
arm_data = bpy.data.armatures.new('rig')
arm = bpy.data.objects.new('Ant', arm_data)
scene.collection.objects.link(arm)
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones


def bone(name, h, t, parent=None):
    b = eb.new(name)
    b.head, b.tail = Vector(h), Vector(t)
    if parent:
        b.parent = eb[parent]
    return b


bone('root', (0, 0, 0), (0, 0, .2))
bone('thorax', (0, .14, .38), (0, -.22, .43), 'root')
bone('head', (0, -.24, .43), (0, -.5, .45), 'thorax')
for s, S in ((-1, 'L'), (1, 'R')):
    bone('mand.' + S, (s * .085, -.57, .37), (s * .03, -.8, .34), 'head')
    bone('scape.' + S, (s * .07, -.5, .52), (s * .25, -.78, .68), 'head')
    bone('flag.' + S, (s * .25, -.78, .68), (s * .36, -1.12, .52), 'scape.' + S)
    for k in range(2):
        bone('wing%d.%s' % (k, S), (s * .04, -.1 + k * .12, .5), (s * .6, .35 + k * .12, .55), 'thorax')
bone('petiole', (0, .16, .35), (0, .28, .36), 'thorax')
bone('gaster', (0, .28, .36), (0, .85, .3), 'petiole')
for L in LEGS:
    n = L['n']
    bone('coxa' + n, L['A'], L['C'], 'thorax')
    bone('femur' + n, L['C'], L['K'], 'coxa' + n)
    bone('tibia' + n, L['K'], L['F'], 'femur' + n)
    bone('tarsus' + n, L['F'], L['FT'], 'tibia' + n)
bpy.ops.object.mode_set(mode='OBJECT')

# un seul maillage pour le corps, un autre pour les ailes, tous deux déformés par le squelette
def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.parent = arm
    mod = o.modifiers.new('rig', 'ARMATURE'); mod.object = arm
    return o


body = join([p for p in PARTS if p not in WINGS], 'AntBody')
wings = join(WINGS, 'AntWings')
print('triangles corps :', sum(len(p.vertices) - 2 for p in body.data.polygons))

# ---------------------------------------------------------------- animations
bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode='POSE')
pb = arm.pose.bones
for b in pb:
    b.rotation_mode = 'QUATERNION'
Z = Vector((0, 0, 1))


def local_q(b, axis, ang):
    R = b.bone.matrix_local.to_3x3()
    return Quaternion((R.inverted() @ Vector(axis)).normalized(), ang)


def reset():
    for b in pb:
        b.rotation_quaternion = (1, 0, 0, 0)
        b.location = (0, 0, 0)


def new_action(name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    return act


def key_all(frame, names):
    for n in names:
        pb[n].keyframe_insert('rotation_quaternion', frame=frame)


actions = []
# marche : trépied alterné (avant gauche, milieu droit, arrière gauche ensemble)
act = new_action('walk')
N = 24
legbones = [x for L in LEGS for x in ('coxa' + L['n'], 'femur' + L['n'], 'tibia' + L['n'])]
antb = ['scape.L', 'scape.R', 'flag.L', 'flag.R']
for f in range(N + 1):
    reset()
    t = f / N * math.tau
    for L in LEGS:
        grp = (L['i'] + (0 if L['s'] < 0 else 1)) % 2
        ph = t + grp * math.pi
        fwd = .34 * math.sin(ph)
        lift = .42 * max(0, math.cos(ph))
        pb['coxa' + L['n']].rotation_quaternion = local_q(pb['coxa' + L['n']], Z, -L['s'] * -fwd * -1)
        d = Vector((L['s'], 0, 0))
        pb['femur' + L['n']].rotation_quaternion = local_q(pb['femur' + L['n']], Z.cross(d), -lift)
        pb['tibia' + L['n']].rotation_quaternion = local_q(pb['tibia' + L['n']], Z.cross(d), lift * .5)
    for s, S in ((-1, 'L'), (1, 'R')):
        pb['scape.' + S].rotation_quaternion = local_q(pb['scape.' + S], Z, math.sin(t * 2 + s) * .12)
        pb['flag.' + S].rotation_quaternion = local_q(pb['flag.' + S], Vector((1, 0, 0)), math.sin(t * 2 + s * 2) * .15)
    key_all(f, legbones + antb)
actions.append(act)
# attente : antennes qui sondent, pattes immobiles
act = new_action('idle')
N = 48
for f in range(N + 1):
    reset()
    t = f / N * math.tau
    for s, S in ((-1, 'L'), (1, 'R')):
        pb['scape.' + S].rotation_quaternion = local_q(pb['scape.' + S], Z, math.sin(t + s) * .22) @ local_q(pb['scape.' + S], Vector((1, 0, 0)), math.sin(t * 2 + s) * .1)
        pb['flag.' + S].rotation_quaternion = local_q(pb['flag.' + S], Vector((1, 0, 0)), math.sin(t * 3 + s * 2) * .25)
    key_all(f, legbones + antb)
actions.append(act)
for a in actions:
    for fc in a.fcurves if hasattr(a, 'fcurves') else []:
        for kp in fc.keyframe_points:
            kp.interpolation = 'LINEAR'
    tr = arm.animation_data.nla_tracks.new(); tr.name = a.name
    tr.strips.new(a.name, 0, a)
arm.animation_data.action = None
reset()
bpy.ops.object.mode_set(mode='OBJECT')

os.makedirs(OUT, exist_ok=True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'ant.glb'), export_format='GLB', export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_skins=True, export_yup=True, export_apply=False,
                          export_force_sampling=True, export_optimize_animation_size=False)

# ---------------------------------------------------------------- vue à la première personne : mandibles + fouets d'antennes
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
PARTS.clear()
M_LEG = material('leg', (.05, .035, .025), .38)
for s in (-1, 1):
    mandible('vm_mand_' + ('L' if s < 0 else 'R'), 'vm', s, (0, 0, 0))
    PARTS[-1].name = 'vm_mand_' + ('L' if s < 0 else 'R')
for o in PARTS:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'vm.glb'), export_format='GLB', export_yup=True)
print('ok', OUT)
