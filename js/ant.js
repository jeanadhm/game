'use strict';
// Colonie Noire · modèle de fourmi anatomique (tête, mésosome, pétiole, gastre, 6 pattes articulées, antennes coudées)
const ANT = { geo: {}, sph: new T.SphereGeometry(1, 22, 16) };
ANT.sph.userData.keep = true;
{ const sh = new T.Shape(); sh.moveTo(0, 0); sh.bezierCurveTo(.15, .13, .72, .15, .88, .02); sh.bezierCurveTo(.72, -.1, .2, -.08, 0, 0);
  ANT.wing = new T.ShapeGeometry(sh, 10); ANT.wing.userData.keep = true; }
function limbGeo(len, r) {
  const k = len.toFixed(3) + '_' + r.toFixed(3);
  if (!ANT.geo[k]) { const g = new T.CylinderGeometry(r * .6, r, len, 8, 1); g.rotateZ(-Math.PI / 2); g.translate(len / 2, 0, 0); g.userData.keep = true; ANT.geo[k] = g; }
  return ANT.geo[k];
}
function chitinMat(color, rough = .3) {
  return new T.MeshPhysicalMaterial({ color, roughness: rough, metalness: .08, clearcoat: 1, clearcoatRoughness: .18 });
}
const X_AXIS = new T.Vector3(1, 0, 0);
function aim(obj, dir) { obj.quaternion.setFromUnitVectors(X_AXIS, dir.clone().normalize()); }

// modèle de secours, entièrement généré par le code (si models/ant.glb ne se charge pas)
function buildAntProc(o) {
  const root = new T.Group(), body = new T.Group(); root.add(body); root.rotation.order = 'YXZ';
  const mB = chitinMat(o.body), mG = chitinMat(o.gaster, .22), mL = chitinMat(o.legs || o.body, .42);
  const mE = new T.MeshPhysicalMaterial({ color: '#060606', roughness: .05, clearcoat: 1 });
  const hs = o.head || 1, ll = o.legLen || 1;
  const blob = (m, sx, sy, sz, x, y, z, p = body) => { const s = new T.Mesh(ANT.sph, m); s.scale.set(sx, sy, sz); s.position.set(x, y, z); s.castShadow = true; p.add(s); return s; };

  // gastre (abdomen) avec ses segments
  const gaster = new T.Group(); gaster.position.set(0, .36, -.2); gaster.rotation.x = -.3; body.add(gaster);
  blob(mG, .3, .26, .4, 0, 0, -.3, gaster);
  for (let i = 0; i < 3; i++) { const dz = .16 - i * .17, k = Math.sqrt(Math.max(0, 1 - (dz / .4) ** 2)); blob(mG, .3 * k + .012, .26 * k + .01, .035, 0, 0, -.3 + dz, gaster); }
  blob(mB, .07, .075, .08, 0, .33, -.12);                   // pétiole
  blob(mB, .12, .12, .27, 0, .37, .07).rotation.x = .18;     // mésosome
  blob(mB, .105, .1, .11, 0, .42, .2);                        // pronotum
  const head = new T.Group(); head.position.set(0, .44, .36); head.scale.setScalar(hs); body.add(head);
  blob(mB, .2, .165, .2, 0, 0, .07, head);
  for (const s of [-1, 1]) blob(mE, .05, .065, .07, s * .165, .03, .1, head);

  const mand = [];
  for (const s of [-1, 1]) {
    const p = new T.Group(); p.position.set(s * .08, -.07, .22); head.add(p);
    const m = new T.Mesh(limbGeo(.2, .035), mL); m.castShadow = true; aim(m, new T.Vector3(-s * .45, -.1, .9)); p.add(m);
    mand.push(p);
  }
  const antn = [];
  for (const s of [-1, 1]) {
    const a = new T.Group(); a.position.set(s * .07, .1, .2); head.add(a);
    const d1 = new T.Vector3(s * .45, .75, .5).normalize();
    const sc = new T.Mesh(limbGeo(.3, .018), mL); aim(sc, d1); a.add(sc);
    const el = new T.Group(); el.position.copy(d1).multiplyScalar(.3); a.add(el);
    const fu = new T.Mesh(limbGeo(.36, .016), mL); aim(fu, new T.Vector3(s * .25, -.15, 1)); el.add(fu);
    antn.push(el);
  }
  const legs = [], zs = [.17, .07, -.03], yaw0 = [.75, .05, -.7];
  for (const s of [-1, 1]) {
    const side = new T.Group(); side.scale.x = s; body.add(side);
    for (let i = 0; i < 3; i++) {
      const hip = new T.Group(); hip.position.set(.07, .31, zs[i]); side.add(hip);
      const fem = new T.Group(); hip.add(fem);
      const f = new T.Mesh(limbGeo(.3 * ll, .032), mL); f.castShadow = true; fem.add(f);
      const knee = new T.Group(); knee.position.x = .3 * ll; knee.rotation.z = -1.7; fem.add(knee);
      const tb = new T.Mesh(limbGeo(.42 * ll, .024), mL); tb.castShadow = true; knee.add(tb);
      const ank = new T.Group(); ank.position.x = .42 * ll; ank.rotation.z = .9; knee.add(ank);
      ank.add(new T.Mesh(limbGeo(.18 * ll, .014), mL));
      legs.push({ hip, fem, i, grp: (i + (s > 0 ? 0 : 1)) % 2 });
    }
  }
  body.position.y = (ll - 1) * .25;
  const wings = [];
  if (o.wings) {
    const wm = new T.MeshPhysicalMaterial({ color: '#dfe8ff', roughness: .1, transparent: true, opacity: .3, side: T.DoubleSide, clearcoat: 1, depthWrite: false });
    for (const s of [-1, 1]) for (let k = 0; k < 2; k++) {
      const p = new T.Group(); p.position.set(s * .06, .47, .12 - k * .1); body.add(p);
      const m = new T.Mesh(ANT.wing, wm); m.scale.set(s * (k ? .78 : 1.05), 1, 1); m.rotation.x = -Math.PI / 2; p.add(m);
      p.rotation.y = s * (k ? .6 : .32); wings.push({ p, s, k });
    }
  }

  let ph = Math.random() * 6, tw = Math.random() * 6, open = 0, openT = .12, curl = 0, lift = 0;
  return {
    root, body, head, gaster, legs, mats: [mB, mG, mL],
    hit: [
      { p: new T.Vector3(0, .44, .36 + .07 * hs), r: .2 * hs, head: true },
      { p: new T.Vector3(0, .37, .08), r: .19 },
      { p: new T.Vector3(0, .3, -.5), r: .3 },
    ],
    setOpen(v) { openT = v; },
    setCurl(v) { curl = v; },
    setLift(v) { lift = v; },
    _b: [mB, mG, mL].map(m => m.color.clone()),
    setBurn(k) { this.mats.forEach((m, i) => { m.color.copy(this._b[i]).lerp(CHAR, k); m.clearcoat = 1 - k; }); },
    setFade(k) { for (const m of this.mats) { m.transparent = k < 1; m.opacity = k; } },
    flap(t) { for (const w of wings) w.p.rotation.z = w.s * (Math.sin(t * 46 + w.k * .9) * .7 + .15); },
    anim(dt, speed) {
      ph += dt * speed * 7; tw += dt;
      const amp = Math.min(1, speed * .45);
      for (const L of legs) {
        const p = ph + L.grp * Math.PI;
        L.hip.rotation.y = -(yaw0[L.i] + Math.sin(p) * .32 * amp) * (1 - curl * .6);
        L.fem.rotation.z = .55 + Math.max(0, Math.cos(p)) * .45 * amp + curl * 1.1;
      }
      body.position.y = (ll - 1) * .25 + Math.abs(Math.sin(ph * 2)) * .012 * amp;
      for (let k = 0; k < 2; k++) { antn[k].rotation.y = Math.sin(tw * 3 + k * 2) * .15; antn[k].rotation.z = Math.sin(tw * 2.3 + k) * .12; }
      open += (openT - open) * Math.min(1, dt * 18);
      mand[0].rotation.y = -open; mand[1].rotation.y = open;
      gaster.rotation.x = -.3 + lift + Math.sin(tw * 1.5) * .03;
    },
  };
}

// --- modèle Blender (models/ant.glb) : maillage organique + squelette
// Les pattes sont animées par cinématique inverse : chaque pied reste planté au sol et fait un pas
// quand le corps s'éloigne trop, en trépied alterné. Le corps suit le relief sous les pieds.
const CHAR = new T.Color('#0a0705');
ANT.load = done => {
  if (!T.GLTFLoader || !T.SkeletonUtils) { done(); return; }
  const L = new T.GLTFLoader(); let n = 2; const fin = () => { if (--n === 0) done(); };
  L.load('models/ant.glb', g => { ANT.gltf = g; fin(); }, undefined, () => fin());
  L.load('models/vm.glb', g => { ANT.vm = g; fin(); }, undefined, () => fin());
};
const UPV = new T.Vector3(0, 1, 0), XV = new T.Vector3(1, 0, 0), ZV = new T.Vector3(0, 0, 1);
const IKV = [0, 1, 2, 3, 4, 5, 6, 7].map(() => new T.Vector3()), IKQ = [0, 1, 2, 3].map(() => new T.Quaternion());
const easeStep = t => t < .5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);

// o: { body, gaster, legs, head, legLen, wings, gasterScale, noIK }
function buildAnt(o) {
  if (!ANT.gltf) return buildAntProc(o);
  const g = ANT.gltf, model = T.SkeletonUtils.clone(g.scene);
  const root = new T.Group(), body = new T.Group(); root.rotation.order = 'YXZ'; body.rotation.order = 'YXZ'; root.add(body); body.add(model);
  const mB = chitinMat(o.body), mG = chitinMat(o.gaster, .22), mL = chitinMat(o.legs || o.body, .4);
  const mE = new T.MeshPhysicalMaterial({ color: '#050505', roughness: .05, clearcoat: 1 });
  const mW = new T.MeshPhysicalMaterial({ color: '#dfe8ff', roughness: .1, transparent: true, opacity: .32, side: T.DoubleSide, clearcoat: 1, depthWrite: false });
  const map = { body: mB, gaster: mG, leg: mL, eye: mE, wing: mW };
  model.traverse(m => { if (m.isMesh) { m.material = map[m.material.name] || mB; m.castShadow = true; m.frustumCulled = false; if (m.material === mW) m.visible = !!o.wings; } });
  const B = {}; model.traverse(n => { if (n.isBone) B[n.name.replace(/[.]/g, '')] = n; });
  const hs = o.head || 1;
  if (B.head) B.head.scale.setScalar(hs);
  if (B.gaster && o.gasterScale) B.gaster.scale.setScalar(o.gasterScale);
  if (o.legLen && o.legLen !== 1) for (let i = 0; i < 3; i++) for (const S of 'LR') if (B['femur' + i + S]) B['femur' + i + S].scale.setScalar(o.legLen);
  model.updateMatrixWorld(true);
  const rig = {}, q = new T.Quaternion();
  for (const k in B) { const b = B[k]; b.getWorldQuaternion(q); q.invert(); rig[k] = { rest: b.quaternion.clone(), up: UPV.clone().applyQuaternion(q), x: XV.clone().applyQuaternion(q), z: ZV.clone().applyQuaternion(q) }; }
  const setRot = (k, axis, ang) => { const r = rig[k]; if (!r) return; B[k].quaternion.copy(r.rest).multiply(q.setFromAxisAngle(r[axis], ang)); };
  // pattes : position de repos de la cheville (repère du modèle), axes des os
  const legs = [];
  for (let i = 0; i < 3; i++) for (const [S, s] of [['L', -1], ['R', 1]]) {
    const fe = B['femur' + i + S], ti = B['tibia' + i + S], ta = B['tarsus' + i + S]; if (!fe || !ti || !ta) continue;
    const home = new T.Vector3(); ta.getWorldPosition(home); model.worldToLocal(home);
    legs.push({ i, s, S, fe, ti, ta, home, drop: home.y, axF: ti.position.clone().normalize(), axT: ta.position.clone().normalize(), axA: UPV.clone(),
      foot: new T.Vector3(), from: new T.Vector3(), to: new T.Vector3(), goal: new T.Vector3(), t: 1, dur: .15, grp: (i + (s < 0 ? 0 : 1)) % 2 });
  }
  const mixer = new T.AnimationMixer(model), clip = n => g.animations.find(a => a.name === n);
  const idle = mixer.clipAction(clip('idle')); idle.play(); idle.time = Math.random() * 2;
  let open = 0, openT = .1, lift = 0, curl = 0, dead = false, fade = 1, ft = Math.random() * 6, ikOn = !o.noIK && !o.wings, init = false, bodyY = 0, pitchB = 0, rollB = 0;
  const mats = [mB, mG, mL], base = mats.map(m => ({ c: m.color.clone(), r: m.roughness }));

  // oriente un os pour que son axe vers l'enfant pointe dans la direction voulue (repère monde)
  function aimBone(b, axisLocal, dir, rest) {
    const P = IKQ[0], R = IKQ[1], A = IKQ[2];
    b.parent.getWorldQuaternion(P); R.copy(P).multiply(rest);
    const d0 = IKV[7].copy(axisLocal).applyQuaternion(R);
    A.setFromUnitVectors(d0, dir).multiply(R);
    b.quaternion.copy(P.invert().multiply(A));
    b.updateMatrixWorld(true);
  }
  function solve(L, target, out, up) {
    const hip = IKV[0], kn = IKV[1], an = IKV[2], dir = IKV[3], pole = IKV[4], knee = IKV[5];
    L.fe.getWorldPosition(hip); L.ti.getWorldPosition(kn); L.ta.getWorldPosition(an);
    const a = hip.distanceTo(kn), b = kn.distanceTo(an);
    dir.copy(target).sub(hip); let d = dir.length(); d = clamp(d, Math.abs(a - b) + 1e-3, a + b - 1e-3); dir.normalize();
    pole.copy(out).multiplyScalar(.55).add(up); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sa = Math.sqrt(1 - ca * ca);
    knee.copy(hip).addScaledVector(dir, a * ca).addScaledVector(pole, a * sa);
    aimBone(L.fe, L.axF, IKV[6].copy(knee).sub(hip).normalize(), rig['femur' + L.i + L.S].rest);
    L.ti.getWorldPosition(kn);
    aimBone(L.ti, L.axT, IKV[6].copy(target).sub(kn).normalize(), rig['tibia' + L.i + L.S].rest);
    aimBone(L.ta, L.axA, IKV[6].copy(out).multiplyScalar(.5).sub(up).normalize(), rig['tarsus' + L.i + L.S].rest);
  }
  const api = {
    root, body, head: B.head, gaster: B.gaster, mats, legs, ik: ikOn, onStep: null,
    hit: [
      { p: new T.Vector3(0, .44, .36 + .07 * hs), r: .2 * hs, head: true },
      { p: new T.Vector3(0, .38, .08), r: .19 },
      { p: new T.Vector3(0, .34, -.52), r: .3 * (o.gasterScale || 1), rear: true },
    ],
    setOpen(v) { openT = v; },
    setLift(v) { lift = v; },
    setCurl(v) { curl = v; if (v > 0 && !dead) { dead = true; idle.fadeOut(.3); } },
    setBurn(k) { mats.forEach((m, i) => { m.color.copy(base[i].c).lerp(CHAR, k); m.roughness = lerp(base[i].r, .95, k); m.clearcoat = 1 - k; }); },
    setFade(k) { if (fade === k) return; fade = k; for (const m of [...mats, mE]) { m.transparent = k < 1; m.opacity = k; m.depthWrite = k > .5; } },
    flap(t) { for (let k = 0; k < 2; k++) for (const [S, s] of [['L', -1], ['R', 1]]) setRot('wing' + k + S, 'z', s * (Math.sin(t * 46 + k * .9) * .7 + .15)); },
    resetFeet() { init = false; },
    // vel : vitesse au sol (monde). speed : vitesse relative à la taille.
    anim(dt, speed, vel) {
      mixer.update(dt);
      open += (openT - open) * Math.min(1, dt * 18);
      setRot('mandL', 'up', -open); setRot('mandR', 'up', open);
      setRot('gaster', 'x', lift + Math.sin((ft += dt) * 1.5) * .03);
      if (dead || !ikOn || !world || !world.floor) {
        const c = dead ? curl : (o.wings ? .35 : 0);
        for (let i = 0; i < 3; i++) for (const [S, s] of [['L', -1], ['R', 1]]) { setRot('femur' + i + S, 'z', s * c * 1.3); setRot('tibia' + i + S, 'z', s * c * .9); }
        body.position.y = 0; body.rotation.set(0, 0, 0);
        return;
      }
      const sc = root.scale.x, vx = vel ? vel.x : 0, vz = vel ? vel.z : 0, sp = Math.hypot(vx, vz);
      // corps : hauteur et inclinaison d'après les pieds posés
      if (init) {
        let sy = 0, f = 0, bk = 0, l = 0, r = 0;
        for (const L of legs) { sy += L.foot.y; if (L.i === 0) f += L.foot.y; if (L.i === 2) bk += L.foot.y; if (L.s < 0) l += L.foot.y; else r += L.foot.y; }
        const avg = sy / legs.length - root.position.y;
        bodyY += ((avg - legs[0].drop * sc) / sc * .7 - bodyY) * Math.min(1, dt * 10);
        pitchB += (Math.atan2((f - bk) / 2, .7 * sc) - pitchB) * Math.min(1, dt * 8);
        rollB += (Math.atan2((r - l) / 3, 1.1 * sc) - rollB) * Math.min(1, dt * 8);
        let stepping = 0; for (const L of legs) if (L.t < 1) stepping += Math.sin(Math.PI * L.t);
        body.position.y = bodyY + stepping * .006;
        body.rotation.x = -pitchB; body.rotation.z = rollB * .8;
      }
      root.updateMatrixWorld(true);
      const outV = IKV[4].set(0, 0, 0), up = new T.Vector3(0, 1, 0).applyQuaternion(root.quaternion);
      const yQ = IKQ[3].setFromAxisAngle(UPV, root.rotation.y);
      const rel = sp / sc, dur = clamp(.2 - rel * .03, .05, .2), lead = dur * 1.6 + .04, thr = .17 * sc + Math.min(.24 * sc, sp * .03), gy = root.position.y + 1.2 * sc;
      for (const L of legs) {
        L.goal.copy(L.home); L.goal.y = 0; model.localToWorld(L.goal);
        L.goal.x += vx * lead; L.goal.z += vz * lead;
        L.goal.y = world.groundAt(L.goal.x, L.goal.z, gy) + L.drop * sc * .55;
        if (!init) { L.foot.copy(L.goal); L.t = 1; }
      }
      init = true;
      let active = -1; for (const L of legs) if (L.t < 1) { active = L.grp; break; }
      const err = L => Math.hypot(L.foot.x - L.goal.x, L.foot.z - L.goal.z);
      const start = L => { L.from.copy(L.foot); L.to.copy(L.goal); L.t = 0; L.dur = dur; };
      if (active < 0) {
        let best = null, be = thr;
        for (const L of legs) { const e = err(L); if (e > be) { be = e; best = L; } }
        if (best) for (const L of legs) if (L.grp === best.grp && err(L) > thr * .35) start(L);
      } else {
        for (const L of legs) if (L.grp === active && L.t >= 1 && err(L) > thr) start(L);
        // l'autre trépied peut partir dès que le premier a presque fini : allure rapide sans glissade
        if (legs.every(L => L.grp !== active || L.t > .7)) for (const L of legs) if (L.grp !== active && L.t >= 1 && err(L) > thr * 1.2) start(L);
      }
      for (const L of legs) {
        if (err(L) > 12 * sc) { L.foot.copy(L.goal); L.t = 1; }
        else if (L.t >= 1 && err(L) > thr * 3) start(L);
        if (L.t < 1) {
          L.t = Math.min(1, L.t + dt / L.dur); const k = easeStep(L.t);
          L.foot.lerpVectors(L.from, L.to, k); L.foot.y += Math.sin(Math.PI * L.t) * (.1 + Math.min(.12, sp * .01)) * sc;
          if (L.t >= 1 && api.onStep) api.onStep(L);
        }
        const ov = IKV[5].set(L.s, 0, 0).applyQuaternion(yQ);
        outV.copy(ov);
        solve(L, L.foot, outV.clone(), up);
      }
    },
  };
  return api;
}
