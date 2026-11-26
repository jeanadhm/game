# Colonie Noire · modélisation du décor dans Blender (script, aucune action manuelle)
# Usage : python build_nature.py <dossier_sortie>   (module bpy : pip install bpy)
# Produit models/nature.glb : cailloux, brindilles, feuilles, herbe, trèfle, pissenlits, champignons,
# entrée de fourmilière, racines, champignons lumineux, arche de tunnel, graine, œuf, larve, cocon.
# Les couleurs sont peintes dans les sommets (attribut de couleur), le relief est dans la géométrie.
# Repère Blender : Z haut. Les objets « couchés » (feuille, brindille) s'allongent sur -Y (devient +Z dans le jeu).
import bpy, bmesh, math, random, os, sys
from mathutils import Vector, noise

OUT = sys.argv[-1] if len(sys.argv) > 1 and os.path.isdir(sys.argv[-1]) else os.path.join(os.path.dirname(__file__), '..', 'models')
random.seed(11)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
MAT = bpy.data.materials.new('nature')


def C(r, g, b):  # couleur sRGB 0-255 vers linéaire
    return Vector(((r / 255) ** 2.2, (g / 255) ** 2.2, (b / 255) ** 2.2))


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return a * (1 - t) + b * t


def build(name, bm, colfn, smooth=True, uv=None):
    bm.verts.index_update()
    bm.normal_update()
    lay = bm.loops.layers.color.new('Col')
    uvl = bm.loops.layers.uv.new('UV') if uv else None
    cache = {}
    for f in bm.faces:
        f.smooth = smooth
        for l in f.loops:
            v = l.vert
            if v.index not in cache:
                c = colfn(v.co, v.normal)
                cache[v.index] = (c.x, c.y, c.z, 1.0)
            l[lay] = cache[v.index]
            if uvl:
                l[uvl].uv = uv(v.co)
    me = bpy.data.meshes.new(name)
    bm.verts.index_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(MAT)
    try:
        me.color_attributes.active_color = me.color_attributes['Col']
    except Exception:
        pass
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def decimate(ob, ratio):
    m = ob.modifiers.new('dec', 'DECIMATE')
    m.ratio = ratio
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    ob.modifiers.clear()
    old = ob.data
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def tube(bm, pts, radius, k=12, cap=True, ang_mod=None):
    """Tube le long d'une polyligne ; radius(i, t, angle) ; renvoie les anneaux."""
    rings = []
    n = len(pts)
    prev_a = None
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        ref = Vector((0, 0, 1)) if abs(d.z) < .9 else Vector((1, 0, 0))
        a = d.cross(ref).normalized() if prev_a is None else (prev_a - d * prev_a.dot(d)).normalized()
        prev_a = a
        b = d.cross(a).normalized()
        ring = []
        for j in range(k):
            t = j / k * math.tau
            r = radius(i, i / (n - 1), t)
            ring.append(bm.verts.new(p + (a * math.cos(t) + b * math.sin(t)) * r))
        rings.append(ring)
    for i in range(n - 1):
        for j in range(k):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % k], rings[i + 1][(j + 1) % k], rings[i + 1][j]))
    if cap:
        for ring, p, s in ((rings[0], pts[0], -1), (rings[-1], pts[-1], 1)):
            c = bm.verts.new(p)
            for j in range(k):
                bm.faces.new((ring[j], ring[(j + 1) % k], c) if s > 0 else (ring[(j + 1) % k], ring[j], c))
    return rings


def surface(bm, nu, nv, f, double=False):
    """Surface paramétrique f(u, v) -> Vector, u et v dans [0, 1]."""
    g = [[bm.verts.new(f(i / nu, j / nv)) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((g[i][j], g[i + 1][j], g[i + 1][j + 1], g[i][j + 1]))
    return g


def lump(bm, c, r, seed, detail=1, flat=1.0):
    ret = bmesh.ops.create_icosphere(bm, subdivisions=detail, radius=1)
    for v in ret['verts']:
        n = v.co.normalized()
        k = 1 + noise.noise(n * 2.3 + Vector((seed, seed * .7, 0))) * .35
        v.co = Vector(c) + Vector((n.x * r * k, n.y * r * k, n.z * r * k * flat))
    return ret['verts']


OBJS = []

# ------------------------------------------------------------------ cailloux
def sph_uv(co):
    n = co.normalized()
    return (math.atan2(n.y, n.x) / math.tau * 3 + .5, math.acos(max(-1, min(1, n.z))) / math.pi * 2)


for i in range(5):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1)
    sd = Vector((i * 3.7, i * 1.3, i * .9))
    flat = (.55, .7, .5, .62, .8)[i]
    for v in bm.verts:
        n = v.co.normalized()
        d = noise.fractal(n * 1.2 + sd, .7, 2.1, 5) * .38
        d += abs(noise.noise(n * 4 + sd)) * -.07                     # éclats
        d += math.sin((n.z * 9 + noise.noise(n * 2 + sd) * 2)) * .015   # strates
        p = n * (1 + d)
        p.z *= flat
        if p.z < -.15:
            p.z = -.15 + (p.z + .15) * .25                            # base aplatie, enfoncée dans le sol
        v.co = p

    def rcol(co, no, sd=sd):
        n = noise.noise(co * 1.5 + sd)
        c = mix(C(128, 122, 112), C(118, 98, 78), n * .8 + .4)
        cav = noise.noise(co * 5 + sd) * .5 + .5
        c = c * (.7 + .45 * cav)
        if no.z > .45 and noise.noise(co * 2.2 + sd * 2) > -.05:
            c = mix(c, C(72, 98, 42), min(1, (no.z - .45) * 2.5))      # mousse sur le dessus
        if noise.noise(co * 9 + sd) > .55:
            c = mix(c, C(178, 176, 148), .7)                            # lichen
        if co.z < -.1:
            c = c * .6                                                  # terre au pied
        return c
    OBJS.append(decimate(build('rock_%d' % i, bm, rcol, uv=sph_uv), .45))

bm = bmesh.new()
lump(bm, (0, 0, 0), 1, 4.2, detail=2, flat=.65)
OBJS.append(build('pebble', bm, lambda co, no: mix(C(150, 140, 125), C(110, 100, 90), noise.noise(co * 3) + .5)))

# ------------------------------------------------------------------ brindilles (longueur 1 sur -Y, écorce en relief)
for i in range(2):
    bm = bmesh.new()
    sd = Vector((i * 5.1, 2, 0))
    N = 44
    pts = [Vector((noise.noise(Vector((t * 2, 0, i))) * .04, -t, .02 * math.sin(t * 5 + i) + .03)) for t in (j / N for j in range(N + 1))]
    knots = [random.uniform(.15, .85) for _ in range(3)]

    def rad(j, t, a, sd=sd, knots=knots):
        r = .036 * (1 - .35 * t)
        r *= 1 + .07 * math.sin(a * 7 + t * 30 + noise.noise(Vector((a, t * 8, 0)) + sd) * 3)   # sillons de l'écorce
        for k in knots:
            r *= 1 + .5 * math.exp(-((t - k) / .025) ** 2)              # nœuds
        if j == 0 or j == N:
            r *= .85 + .3 * abs(math.sin(a * 3))                        # bouts cassés
        return r
    tube(bm, pts, rad, k=14)
    # rameau secondaire
    t0 = .45 + i * .1
    base = pts[int(t0 * N)]
    br = [base + Vector((.0 + s * .25 * (1 if i else -1), -s * .12, s * .06)) for s in (j / 12 * .5 for j in range(13))]
    tube(bm, br, lambda j, t, a: .022 * (1 - .5 * t) * (1 + .06 * math.sin(a * 6 + t * 20)), k=10)

    def tcol(co, no, sd=sd):
        c = mix(C(88, 62, 40), C(60, 42, 28), noise.noise(co * 40 + sd) + .5)
        if noise.noise(co * 8 + sd) > .45:
            c = mix(c, C(120, 120, 90), .5)                              # lichen gris
        if co.y > -.01 or co.y < -.99:
            c = mix(c, C(196, 164, 116), .8)                             # bois clair aux cassures
        return c
    OBJS.append(build('twig_%d' % i, bm, tcol))

# ------------------------------------------------------------------ feuilles (nervures en creux, nervure centrale en relief, bord dentelé)
def leaf(name, dry):
    bm = bmesh.new()
    sd = Vector((3.3 if dry else 1.1, 0, 0))

    def width(v):
        return .44 * math.sin(math.pi * v) ** .75 * (1 - .12 * v) + .004

    def vein(x, v):
        g = 0
        for k in range(9):
            v0 = .08 + k * .095
            g += math.exp(-((v - (v0 + .38 * abs(x))) / .009) ** 2)
        return min(1, g)

    def f(u, v):
        w = width(v)
        w *= 1 + .03 * math.sin(v * 70)                                   # dents du bord
        x = (u * 2 - 1) * w
        z = (x * x) * (1.6 if dry else .8)                                # bords relevés
        z += .07 * math.sin(math.pi * v) - (.08 if dry else .03) * v * v  # cambrure
        z += .012 * math.exp(-(x / .012) ** 2)                            # nervure centrale
        z -= .005 * vein(x, v) * (1 - abs(u * 2 - 1))
        if dry:
            z += .05 * noise.noise(Vector((x * 6, v * 6, 0)) + sd)
        return Vector((x, -(v - .5), z))
    surface(bm, 18, 44, f)

    def col(co, no):
        v = -co.y + .5
        x = co.x
        w = width(max(0, min(1, v))) + 1e-3
        e = abs(x) / w
        if dry:
            c = mix(C(170, 110, 45), C(110, 62, 28), e * .7 + noise.noise(co * 9 + sd) * .4)
            if noise.noise(co * 14 + sd) > .4:
                c = c * .55
        else:
            c = mix(C(76, 122, 38), C(104, 146, 52), e)
            c = mix(c, C(150, 172, 70), max(0, noise.noise(co * 5 + sd)) * .5)
            if noise.noise(co * 18 + sd) > .62:
                c = mix(c, C(120, 90, 40), .6)
        vn = vein(x, v) * (1 - e)
        c = mix(c, C(190, 200, 120) if not dry else C(200, 150, 90), vn * .55 + math.exp(-(x / .012) ** 2) * .6)
        return c
    return build(name, bm, col)


OBJS.append(leaf('leaf_green', False))
OBJS.append(leaf('leaf_dry', True))

# ------------------------------------------------------------------ brin d'herbe (hauteur 1, largeur ±0,5 à la base, pli central)
bm = bmesh.new()
rows = []
for j in range(11):
    t = j / 10
    w = .5 * (1 - t) ** .6 + .006
    z = t * t * .38
    tw = t * .5                                                           # légère torsion
    fold = .07 * (1 - t)
    row = []
    for x, y in ((-w, 0), (0, fold), (w, 0)):
        xx = x * math.cos(tw) - y * math.sin(tw)
        yy = x * math.sin(tw) + y * math.cos(tw)
        row.append(bm.verts.new(Vector((xx, -(z + yy), t))))
    rows.append(row)
for j in range(10):
    a, b = rows[j], rows[j + 1]
    bm.faces.new((a[0], a[1], b[1], b[0])); bm.faces.new((a[1], a[2], b[2], b[1]))


def gcol(co, no):
    t = co.z
    c = mix(C(22, 48, 14), C(110, 168, 56), min(1, t * 1.4))
    if t > .72:
        c = mix(c, C(196, 214, 110), (t - .72) * 1.8)
    if abs(co.x) < .02:
        c = c * 1.15
    return c
OBJS.append(build('grass', bm, gcol))

# ------------------------------------------------------------------ trèfle (3 folioles en cœur, chevron clair)
bm = bmesh.new()
tube(bm, [Vector((0, 0, z / 10)) + Vector((math.sin(z / 10 * 2) * .03, 0, 0)) for z in range(11)], lambda j, t, a: .012, k=6)
for k in range(3):
    ang = k / 3 * math.tau + .3

    def f(u, v, ang=ang):
        a = (u * 2 - 1) * math.pi * .5
        r = v * .22 * (1 - .35 * math.exp(-(a / .25) ** 2)) * (math.cos(a) ** .4)   # deux lobes
        lx, ly = math.cos(a) * r, math.sin(a) * r
        z = 1 + .03 * r / .22 - .04 * (r / .22) ** 2
        return Vector((lx * math.cos(ang) - ly * math.sin(ang), lx * math.sin(ang) + ly * math.cos(ang), z))
    surface(bm, 14, 8, f)


def ccol(co, no):
    r = math.hypot(co.x, co.y)
    c = mix(C(48, 98, 34), C(70, 128, 44), noise.noise(co * 10) + .5)
    if co.z > .9 and .08 < r < .12:
        c = mix(c, C(178, 206, 150), .7)
    return c
OBJS.append(build('clover', bm, ccol))

# ------------------------------------------------------------------ pissenlit en fleur (hauteur 1)
bm = bmesh.new()
stem = [Vector((math.sin(t * 2.2) * .03, 0, t)) for t in (j / 24 for j in range(25))]
tube(bm, stem, lambda j, t, a: .014 * (1 - .2 * t), k=10)
H = Vector((stem[-1].x, 0, 1.0))
lump(bm, H + Vector((0, 0, .01)), .05, 1.0, detail=2, flat=.45)
for ring, (n, L, lift) in enumerate(((64, .085, .25), (48, .07, .55), (30, .05, .95))):
    for k in range(n):
        a = k / n * math.tau + ring * .17
        d = Vector((math.cos(a), math.sin(a), 0))
        s = d.cross(Vector((0, 0, 1))) * .006
        p0 = H + d * .02
        p1 = H + d * (.02 + L * .5) + Vector((0, 0, L * .25 * lift + .01))
        p2 = H + d * (.02 + L) + Vector((0, 0, L * .5 * lift + .005))
        vs = [bm.verts.new(p0 - s), bm.verts.new(p0 + s), bm.verts.new(p1 + s * 1.3), bm.verts.new(p2), bm.verts.new(p1 - s * 1.3)]
        bm.faces.new(vs)
for k in range(18):                                                        # bractées
    a = k / 18 * math.tau
    d = Vector((math.cos(a), math.sin(a), 0))
    s = d.cross(Vector((0, 0, 1))) * .005
    vs = [bm.verts.new(H + d * .03 - s + Vector((0, 0, -.01))), bm.verts.new(H + d * .03 + s + Vector((0, 0, -.01))), bm.verts.new(H + d * .07 + Vector((0, 0, -.05)))]
    bm.faces.new(vs)


def dcol(co, no):
    dz = co.z - 1
    r = math.hypot(co.x - H.x, co.y)
    if co.z < .985:
        return mix(C(70, 110, 40), C(110, 140, 60), co.z)
    return mix(C(236, 150, 10), C(255, 214, 40), min(1, r / .07))
OBJS.append(build('dandelion', bm, dcol, smooth=False))

# ------------------------------------------------------------------ pissenlit en graines (aigrettes)
bm = bmesh.new()
tube(bm, stem, lambda j, t, a: .013 * (1 - .2 * t), k=10)
lump(bm, H, .025, 2.0, detail=2)
golden = math.pi * (3 - math.sqrt(5))
for k in range(150):
    y = 1 - (k / 149) * 1.6
    r = math.sqrt(max(0, 1 - y * y))
    d = Vector((math.cos(golden * k) * r, math.sin(golden * k) * r, y))
    if d.z < -.5:
        continue
    tip = H + d * .1
    a = d.cross(Vector((0, 0, 1)) if abs(d.z) < .9 else Vector((1, 0, 0))).normalized() * .0015
    vs = [bm.verts.new(H + d * .025 + a), bm.verts.new(H + d * .025 - a), bm.verts.new(tip)]
    bm.faces.new(vs)
    b = d.cross(a).normalized()
    fan = [bm.verts.new(tip)] + [bm.verts.new(tip + d * .012 + (a.normalized() * math.cos(t) + b * math.sin(t)) * .02) for t in (j / 6 * math.tau for j in range(6))]
    for j in range(6):
        bm.faces.new((fan[0], fan[1 + j], fan[1 + (j + 1) % 6]))
OBJS.append(build('puffball', bm, lambda co, no: C(80, 120, 50) if co.z < .97 else C(242, 240, 232), smooth=False))

# ------------------------------------------------------------------ champignons (pied 1, chapeau r 0,38)
def mushroom(name, parasol):
    bm = bmesh.new()
    sd = Vector((7 if parasol else 2, 0, 0))
    pts = [Vector((math.sin(t * 1.5) * .02, 0, t * .95)) for t in (j / 20 for j in range(21))]
    tube(bm, pts, lambda j, t, a: (.075 + .05 * math.exp(-(t / .12) ** 2)) * (1 + .03 * noise.noise(Vector((a * 2, t * 8, 0)) + sd)), k=16)
    top = pts[-1]
    if parasol:                                                            # anneau
        rr = [bm.verts.new(top * .72 + Vector((math.cos(a) * r, math.sin(a) * r, -r * .3))) for r in (.08, .14) for a in (k / 20 * math.tau for k in range(20))]
        for k in range(20):
            bm.faces.new((rr[k], rr[(k + 1) % 20], rr[20 + (k + 1) % 20], rr[20 + k]))
    R, Hc = .38, (.12 if parasol else .2)

    def cap(u, v):
        a = u * math.tau
        r = v * R
        h = Hc * (1 - (v ** 2.2)) + (.05 * math.exp(-(v / .15) ** 2) if parasol else 0)
        h += .006 * noise.noise(Vector((math.cos(a) * r * 9, math.sin(a) * r * 9, 0)) + sd)
        rim = 1 - .04 * v ** 8
        return Vector((math.cos(a) * r * rim, math.sin(a) * r * rim, top.z + .02 + h - (.03 * v ** 6)))
    surface(bm, 48, 16, cap)
    # dessous : lamelles (coulemelle) ou pores (bolet)
    for k in range(64 if parasol else 0):
        a = k / 64 * math.tau
        d = Vector((math.cos(a), math.sin(a), 0))
        vs = [bm.verts.new(top + d * .08 + Vector((0, 0, .02))), bm.verts.new(top + d * R * .97 + Vector((0, 0, -.02))), bm.verts.new(top + d * R * .9 + Vector((0, 0, -.045))), bm.verts.new(top + d * .1 + Vector((0, 0, -.01)))]
        bm.faces.new(vs)
    under = surface(bm, 48, 4, lambda u, v: Vector((math.cos(u * math.tau) * v * R * .98, math.sin(u * math.tau) * v * R * .98, top.z + .015 - .03 * v ** 6)))

    def col(co, no):
        r = math.hypot(co.x, co.y)
        if co.z < top.z - .01:
            return mix(C(224, 214, 196), C(190, 176, 150), noise.noise(co * 20 + sd) * .5 + .3)
        if no.z < -.2:
            return C(214, 196, 168) if parasol else C(196, 170, 70)
        if parasol:
            c = mix(C(120, 84, 56), C(236, 226, 208), min(1, r / .12))
            if r > .1 and noise.noise(co * 26 + sd) > .25:
                c = mix(c, C(140, 100, 66), .8)                           # écailles
            return c
        return mix(C(120, 64, 30), C(160, 96, 48), noise.noise(co * 6 + sd) + .5) * (1 - .25 * (r / R) ** 4)
    return build(name, bm, col)


OBJS.append(mushroom('mush_brown', False))
OBJS.append(mushroom('mush_parasol', True))

# ------------------------------------------------------------------ bord de l'entrée de la fourmilière (rayon 1)
bm = bmesh.new()
for k in range(260):
    a = random.uniform(0, math.tau)
    d = random.uniform(.9, 1.6) ** 1.2
    lump(bm, (math.cos(a) * d, math.sin(a) * d, max(0, .35 - abs(d - 1.15) * .5) * random.uniform(.6, 1.2)), random.uniform(.05, .13), k * .37, detail=1, flat=.8)
OBJS.append(build('nest_rim', bm, lambda co, no: mix(C(150, 86, 52), C(104, 58, 34), noise.noise(co * 5) + .5) * (.8 + .3 * max(0, no.z))))

# ------------------------------------------------------------------ galeries : racines suspendues (longueur 1 vers le bas)
for i in range(3):
    bm = bmesh.new()
    sd = Vector((i * 2.7, 1, 3))
    pts = [Vector((noise.noise(Vector((t * 3, i, 0))) * .08, noise.noise(Vector((0, t * 3, i))) * .08, -t)) for t in (j / 24 for j in range(25))]
    tube(bm, pts, lambda j, t, a, sd=sd: .05 * (1 - t) ** .8 + .004 * (1 + math.sin(a * 5 + t * 20)), k=10)
    for r in range(5):                                                     # radicelles
        t0 = random.uniform(.2, .8)
        b = pts[int(t0 * 24)]
        d = Vector((random.uniform(-1, 1), random.uniform(-1, 1), -.6)).normalized()
        sub = [b + d * s * .3 + Vector((0, 0, -s * s * .1)) for s in (j / 8 for j in range(9))]
        tube(bm, sub, lambda j, t, a: .012 * (1 - t) + .001, k=6)
    OBJS.append(build('root_%d' % i, bm, lambda co, no, sd=sd: mix(C(96, 66, 42), C(64, 44, 28), noise.noise(co * 20 + sd) + .5)))

# ------------------------------------------------------------------ galeries : grappe de champignons lumineux (mycènes, hauteur 1)
bm = bmesh.new()
for k in range(9):
    a = k * 2.4
    d = .08 + (k % 4) * .07
    base = Vector((math.cos(a) * d, math.sin(a) * d, 0))
    h = random.uniform(.35, 1.0)
    lean = Vector((random.uniform(-.1, .1), random.uniform(-.1, .1), 0))
    pts = [base + lean * t * t + Vector((0, 0, t * h)) for t in (j / 8 for j in range(9))]
    tube(bm, pts, lambda j, t, a: .012, k=6)
    top = pts[-1]
    cr = random.uniform(.05, .11)
    surface(bm, 16, 6, lambda u, v, top=top, cr=cr: top + Vector((math.cos(u * math.tau) * v * cr, math.sin(u * math.tau) * v * cr, cr * .9 * (1 - v ** 1.6) - cr * .3)))
OBJS.append(build('fungus', bm, lambda co, no: mix(C(200, 255, 230), C(90, 160, 140), max(0, 1 - co.z))))

# ------------------------------------------------------------------ galeries : arche de racines pour l'entrée des tunnels (largeur 1)
bm = bmesh.new()
for k in range(6):
    off = (k - 2.5) * .03
    pts = []
    for j in range(21):
        t = j / 20
        a = math.pi * t
        pts.append(Vector((-math.cos(a) * (.5 + off), .05 * math.sin(t * 9 + k), math.sin(a) * (.62 + off * 2) + noise.noise(Vector((t * 4, k, 0))) * .04)))
    tube(bm, pts, lambda j, t, a: .035 * (1 + .5 * (1 - math.sin(math.pi * t))) + .004 * math.sin(a * 5), k=8)
for k in range(30):
    a = random.uniform(0, math.pi)
    lump(bm, (-math.cos(a) * .55, random.uniform(-.06, .06), math.sin(a) * .66), random.uniform(.04, .08), k, detail=1)
OBJS.append(build('arch', bm, lambda co, no: mix(C(92, 62, 40), C(60, 40, 26), noise.noise(co * 12) + .5)))

# ------------------------------------------------------------------ graine, œuf, larve, cocon
bm = bmesh.new()
for v in lump(bm, (0, 0, 0), 1, 9, detail=3):
    v.co.x *= .55; v.co.z *= .45
    v.co.z -= .08 * math.exp(-(v.co.x / .08) ** 2) * (v.co.z > 0)          # sillon
OBJS.append(build('seed', bm, lambda co, no: mix(C(204, 166, 104), C(160, 116, 60), noise.noise(co * 6) + .5)))
bm = bmesh.new()
bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=1)
for v in bm.verts:
    v.co.x *= .7; v.co.y *= 1.0; v.co.z *= .7
OBJS.append(build('egg', bm, lambda co, no: C(244, 236, 214)))
bm = bmesh.new()                                                            # larve : asticot en C, segmentée
pts = [Vector((math.cos(a) * .5, 0, math.sin(a) * .5)) for a in (math.pi * (.15 + 1.25 * j / 30) for j in range(31))]
tube(bm, pts, lambda j, t, a: (.16 + .08 * math.sin(math.pi * t)) * (1 + .06 * math.cos(t * 60)), k=14)
OBJS.append(build('larva', bm, lambda co, no: C(240, 228, 196) if co.x > -.45 or co.z > .1 else C(200, 160, 100)))
bm = bmesh.new()                                                            # cocon de soie
pts = [Vector((0, -t + .5, 0)) for t in (j / 24 for j in range(25))]
tube(bm, pts, lambda j, t, a: .26 * math.sin(math.pi * t) ** .6 * (1 + .04 * math.sin(a * 9 + t * 14)) + .01, k=18)
OBJS.append(build('cocoon', bm, lambda co, no: mix(C(240, 228, 200), C(214, 196, 160), noise.noise(co * 12) + .5)))

# ------------------------------------------------------------------ fourmilière rouge : dôme d'aiguilles de pin, brindilles et grains (rayon 1, hauteur 0,42)
bm = bmesh.new()
def dome_h(r, a):
    h = .42 * max(0, 1 - r * r) ** .8 + .02 * noise.noise(Vector((math.cos(a) * r * 4, math.sin(a) * r * 4, 0)))
    if r < .13:
        h -= .09 * (1 - r / .13) ** .7                                     # cratère d'entrée
    for ea in (.6, 2.9, 4.7):                                              # entrées latérales
        dx, dy = math.cos(a) * r - math.cos(ea) * .62, math.sin(a) * r - math.sin(ea) * .62
        h -= .07 * math.exp(-(dx * dx + dy * dy) / .004)
    return h
surface(bm, 72, 26, lambda u, v: Vector((math.cos(u * math.tau) * (.06 + v * .97), math.sin(u * math.tau) * (.06 + v * .97), dome_h(.06 + v * .97, u * math.tau))))
for k in range(1700):                                                      # aiguilles posées sur le dôme
    r = math.sqrt(random.uniform(.02, 1)) * .98
    a = random.uniform(0, math.tau)
    c = Vector((math.cos(a) * r, math.sin(a) * r, dome_h(r, a) + .004))
    th = random.uniform(0, math.tau)
    d = Vector((math.cos(th), math.sin(th), 0))
    L = random.uniform(.04, .085)
    p0, p1 = c - d * L / 2, c + d * L / 2
    p0.z = dome_h(math.hypot(p0.x, p0.y), math.atan2(p0.y, p0.x)) + .004
    p1.z = dome_h(math.hypot(p1.x, p1.y), math.atan2(p1.y, p1.x)) + .004
    tube(bm, [p0, (p0 + p1) / 2 + Vector((0, 0, .002)), p1], lambda j, t, aa: .0045, k=4, cap=False)
for k in range(22):                                                        # brindilles
    r = random.uniform(.15, .9); a = random.uniform(0, math.tau); th = random.uniform(0, math.tau)
    c = Vector((math.cos(a) * r, math.sin(a) * r, 0)); d = Vector((math.cos(th), math.sin(th), 0)); L = random.uniform(.08, .16)
    pts = []
    for j in range(6):
        q = c + d * (j / 5 - .5) * L
        q.z = dome_h(math.hypot(q.x, q.y), math.atan2(q.y, q.x)) + .008
        pts.append(q)
    tube(bm, pts, lambda j, t, aa: .008, k=6)
for k in range(260):                                                       # grains de terre
    r = math.sqrt(random.uniform(0, 1)); a = random.uniform(0, math.tau)
    lump(bm, (math.cos(a) * r, math.sin(a) * r, dome_h(r, a)), random.uniform(.006, .014), k * .3, detail=0)

def acol(co, no):
    r = math.hypot(co.x, co.y)
    c = mix(C(150, 84, 44), C(110, 58, 30), noise.noise(co * 30) + .5)
    if r < .16 and co.z < .36:
        c = c * .35                                                        # ombre du cratère
    return c
OBJS.append(build('anthill', bm, acol))

# ------------------------------------------------------------------ export
for o in OBJS:
    o.location = (0, 0, 0)
tri = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in OBJS)
print('objets :', len(OBJS), ' triangles :', tri)
os.makedirs(OUT, exist_ok=True)
kw = dict(filepath=os.path.join(OUT, 'nature.glb'), export_format='GLB', export_yup=True, export_apply=True)
try:
    bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
print('ok', OUT)
