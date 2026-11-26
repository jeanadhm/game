'use strict';
// Colonie Noire · fourmis rouges : types, IA (patrouille, alerte, poursuite, attaque, crachat, vol), Méga-soldate, boss
const ETYPES = {
  scout:   { name: 'Éclaireuse', hp: 45,   speed: 5.4, dmg: 8,  reach: 1.7, cd: .85, scale: .92, sight: 28, body: '#6e1608', gaster: '#2e0904', head: .95, legLen: 1.12 },
  soldier: { name: 'Soldate',    hp: 130,  speed: 3.7, dmg: 17, reach: 2.2, cd: 1.2, scale: 1.3, sight: 24, body: '#8a200d', gaster: '#3a0d06', head: 1.45 },
  spitter: { name: 'Cracheuse',  hp: 65,   speed: 3.5, dmg: 10, reach: 1.7, cd: 1.8, scale: 1.02, sight: 32, body: '#94300f', gaster: '#c96a1c', ranged: true },
  flyer:   { name: 'Ailée',      hp: 50,   speed: 7,   dmg: 10, reach: 1.6, cd: 1.4, scale: .95, sight: 40, body: '#7a1a0a', gaster: '#3a0c06', head: 1, fly: true, nectar: 2 },
  mega:    { name: 'Méga-soldate', hp: 700, speed: 3.1, dmg: 26, reach: 3.4, cd: 1.6, scale: 2.3, sight: 34, body: '#4a0d06', gaster: '#1e0503', head: 1.7, armored: true, nectar: 8 },
  worker:  { name: 'Ouvrière',   hp: 25,   speed: 4.6, dmg: 4,  reach: 1.4, cd: 1,   scale: .75, sight: 16, body: '#7a1a0a', gaster: '#2e0904', head: .9, nectar: 1 },
  queen:   { name: 'Reine',      hp: 1300, speed: 0,   dmg: 22, reach: 5,   cd: 1.6, scale: 4.2, sight: 40, body: '#7a1a0a', gaster: '#2e0904', head: 1.1, queen: true, nectar: 20 },
  boss:    { name: 'Major Ignis', hp: 1800, speed: 4.4, dmg: 28, reach: 3.9, cd: 1.3, scale: 3.2, sight: 90, body: '#7a1309', gaster: '#250603', head: 1.6, boss: true },
};
const EN = { list: [], flowT: 0 };
(() => {
  const V1 = new T.Vector3(), V2 = new T.Vector3(), V3 = new T.Vector3();
  const tCenter = (t, out) => out.set(t.pos.x, t.pos.y + .35, t.pos.z);
  EN.targets = () => { const l = P.dead ? [] : [P]; for (const a of ALLY.list) if (!a.down) l.push(a); return l; };

  EN.clear = () => { for (const e of EN.list) { scene.remove(e.ant.root); e.ant.mats.forEach(m => m.dispose()); } EN.list = []; };
  EN.spawn = (type, x, z, o = {}) => {
    const d = ETYPES[type], a = buildAnt({ body: o.body || d.body, gaster: o.gaster || d.gaster, head: d.head, legLen: d.legLen, wings: d.fly, gasterScale: d.queen ? 2 : undefined });
    a.root.scale.setScalar(d.scale); scene.add(a.root);
    if (d.armored) for (const m of a.mats) { m.clearcoat = 1; m.roughness = .18; m.metalness = .25; }
    [x, z] = world.openNear(x, z, d.scale);
    const alt = d.fly ? rand(4, 6.5) : 0, y = world.groundAt(x, z, 99) + alt, hp = Math.round(d.hp * diff().hp);
    const e = Object.assign({
      type, d, ant: a, pos: new T.Vector3(x, y, z), vel: new T.Vector3(), vy: 0, alt, ft: Math.random() * 6, mode: 'orbit', mt: rand(2, 4), yaw: Math.random() * 6.28, hp, max: hp,
      alert: false, pend: 0, seen: false, losT: Math.random() * .3, cd: rand(.4, 1.4), atk: 0, home: new T.Vector3(x, y, z), wander: null, wait: 0,
      dead: false, deadT: 0, flash: 0, stun: 0, strafe: Math.random() < .5 ? 1 : -1, strafeT: 0, lastX: x, lastZ: z, b: null, tgt: P, tgtT: 0, slam: 0, slamCd: rand(3, 5), lift: 0, warned: false,
    }, o);
    a.root.position.copy(e.pos); a.root.rotation.y = e.yaw;
    a.onStep = L => { if (L.i === 0 && cam.position.distanceToSquared(e.pos) < 64) SFX.tap(e.d.scale); };
    EN.list.push(e); return e;
  };
  EN.alive = () => EN.list.filter(e => !e.dead);

  EN.alert = e => {
    if (e.alert || e.dead) return;
    e.alert = true; e.cd = Math.max(e.cd, .35);
    SFX.chitter(e.pos.distanceTo(P.pos));
    for (const o of EN.list) if (!o.alert && !o.dead && o.pend <= 0 && o.pos.distanceTo(e.pos) < 14) o.pend = rand(.3, .9);
    G.event('alert', e);
  };
  EN.noise = (p, r) => { for (const e of EN.list) if (!e.alert && !e.dead && e.pos.distanceTo(p) < r) e.pend = e.pend > 0 ? e.pend : rand(.2, .6); };

  EN.hitTest = (p, r) => {
    for (const e of EN.list) {
      if (e.dead) continue; const s = e.d.scale;
      if (Math.abs(p.x - e.pos.x) > 1.6 * s + r || Math.abs(p.z - e.pos.z) > 1.6 * s + r || Math.abs(p.y - e.pos.y) > 2 * s + r) continue;
      e.ant.root.updateMatrixWorld();
      for (const h of e.ant.hit) { V3.copy(h.p).applyMatrix4(e.ant.root.matrixWorld); if (V3.distanceToSquared(p) < (h.r * s + r) ** 2) return { e, head: h.head, rear: h.rear }; }
    }
    return null;
  };
  EN.rayHit = (o, d, max) => {
    let best = null, bt = max;
    for (const e of EN.list) {
      if (e.dead) continue; const s = e.d.scale;
      V3.copy(e.pos).sub(o); const tc = V3.dot(d); if (tc < -2 * s || tc > bt + 2 * s) continue;
      e.ant.root.updateMatrixWorld();
      for (const h of e.ant.hit) {
        V3.copy(h.p).applyMatrix4(e.ant.root.matrixWorld).sub(o);
        const t = V3.dot(d), R = h.r * s * 1.1, d2 = V3.lengthSq() - t * t;
        if (t > 0 && d2 < R * R) { const th = t - Math.sqrt(R * R - d2); if (th < bt) { bt = th; best = { e, head: h.head, rear: h.rear, dist: th }; } }
      }
    }
    return best;
  };
  // blindage frontal de la Méga-soldate : seuls l'arrière et le gastre prennent tous les dégâts
  function frontal(e, from) {
    if (!from) return false;
    const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw), dx = from.x - e.pos.x, dz = from.z - e.pos.z, k = Math.hypot(dx, dz) || 1;
    return (fx * dx + fz * dz) / k > .3;
  }
  EN.damage = (e, amt, head, from, rear) => {
    if (e.dead) return;
    if (e.col && !COL.isWar(e.col)) { COL.provoke(e.col); e.neutral = false; }
    if (e.d.armored && !rear && frontal(e, from)) {
      amt *= .25; head = false; SFX.clang(); FX.splash(V1.copy(e.pos).setY(e.pos.y + .6 * e.d.scale), FX.COL.spark, 6, 2);
      if (!e.warned) { e.warned = true; HUD.notice('Blindée devant : vise son gastre, par l\'arrière ou d\'en haut !', 2.6); }
    }
    if (head) amt *= 2; if (e.stun > 0) amt *= 1.5;
    e.hp -= amt; e.flash = 1; G.stats.hits++;
    if (from === P.pos || from === undefined) HUD.hit(head);
    if (!e.alert) EN.alert(e);
    if (from && !e.d.boss && !e.d.armored) { const kx = e.pos.x - from.x, kz = e.pos.z - from.z, k = Math.hypot(kx, kz) || 1; e.vel.x += kx / k * 3; e.vel.z += kz / k * 3; }
    if (e.d.boss) HUD.boss(e.d.name, Math.max(0, e.hp / e.max));
    if (e.hp <= 0) EN.kill(e, head);
  };
  EN.kill = (e, head) => {
    e.dead = true; e.deadT = 0; e.hp = 0; e.ant.setOpen(.5);
    SFX.kill(); G.stats.kills++; if (head) G.stats.heads++;
    if (e.col) { const c = COL.get(e.col); if (c) { const k = e.type === 'worker' ? 'workers' : 'soldiers'; c[k] = Math.max(0, c[k] - 1); } }
    const nc = e.d.nectar || (e.type === 'scout' ? 1 : e.d.boss ? 0 : 2); if (nc) addNectar(nc);
    HUD.feed(e.d.name + (head ? ' · tir à la tête' : '') + (nc ? `  +${nc} nectar` : ''));
    if (!e.d.boss && !e.d.queen) { const r = Math.random(); if (r < .3 || e.d.armored) PK.spawn('heal', e.pos.x, e.pos.z); else if (r < .42) PK.spawn('seed', e.pos.x, e.pos.z); else if (r < .5) PK.spawn('armor', e.pos.x, e.pos.z); }
    G.event('kill', e);
  };
  EN.radial = (p, R, dmg) => {
    for (const e of EN.list) {
      if (e.dead) continue; const s = e.d.scale;
      const d = Math.hypot(e.pos.x - p.x, e.pos.y + .4 * s - p.y, e.pos.z - p.z), rr = R + .5 * s;
      if (d < rr) { EN.damage(e, dmg * (1 - d / rr) + 10, false, p, true); if (!e.d.boss && !e.d.armored) { const k = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) || 1; e.vel.x += (e.pos.x - p.x) / k * 8; e.vel.z += (e.pos.z - p.z) / k * 8; } }
    }
  };

  const mouth = (e, out) => { e.ant.root.updateMatrixWorld(); return out.set(0, .42, .62).applyMatrix4(e.ant.root.matrixWorld); };
  function spitAt(e, t, speed, spread, dmg) {
    const m = mouth(e, V1), tt = m.distanceTo(t.pos) / speed;
    V2.set(t.pos.x + t.vel.x * tt * .6, t.pos.y + .35, t.pos.z + t.vel.z * tt * .6).sub(m).normalize();
    V2.x += rand(-spread, spread); V2.y += rand(-spread, spread) * .5; V2.z += rand(-spread, spread);
    V2.normalize().multiplyScalar(speed); V2.y += 3.5 * tt;
    FX.fire('eacid', m, V2, 'e', dmg); SFX.spit(e.pos.distanceTo(P.pos));
  }
  function pathDir(e, t, dist) {
    if (e.seen && dist < 10) return [t.pos.x - e.pos.x, t.pos.z - e.pos.z];
    const s = world.nextStep(e.pos.x, e.pos.z);
    if (s) return [s[0] - e.pos.x, s[1] - e.pos.z];
    return [e.lastX - e.pos.x, e.lastZ - e.pos.z];
  }
  function pickTarget(e, pe) {
    const ts = EN.targets(); if (!ts.length) { e.tgt = null; return; }
    let best = null, bd = 1e9;
    for (const t of ts) { const d = Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z) - (t === P ? 1.5 : 0); if (d < bd) { bd = d; best = t; } }
    e.tgt = best;
  }

  function flyer(e, dt, t, dist, dx, dz, passive) {
    const a = e.ant, s = e.d.scale, f = world.floorAt(e.pos.x, e.pos.z), ceil = world.ceilAt(e.pos.x, e.pos.z);
    e.ft += dt; e.mt -= dt;
    let tx, tz, ty = f + e.alt, spd = e.d.speed * .5, face = false;
    if (!e.alert || passive || !t) { const ang = e.ft * .45 + e.home.x; tx = e.home.x + Math.cos(ang) * 6 - e.pos.x; tz = e.home.z + Math.sin(ang) * 6 - e.pos.z; }
    else {
      const k = dist || 1;
      if (e.mode === 'orbit') {
        tx = -dz / k * e.strafe + dx / k * (dist - 9) * .35; tz = dx / k * e.strafe + dz / k * (dist - 9) * .35; ty = t.pos.y + 4.5; spd = e.d.speed * .75;
        if (e.mt <= 0 && e.seen) { e.mode = 'dive'; e.mt = 1.7; SFX.chitter(dist); }
      } else if (e.mode === 'dive') {
        tx = dx; tz = dz; ty = t.pos.y + .45; spd = e.d.speed * 1.6; face = true;
        if (Math.hypot(dx, t.pos.y + .4 - e.pos.y, dz) < 1.5 && e.cd <= 0) { t.damage(e.d.dmg, e.pos); SFX.bite(); e.cd = e.d.cd; e.mode = 'climb'; e.mt = 1.2; }
        if (e.mt <= 0) { e.mode = 'climb'; e.mt = 1.2; }
      } else { tx = -dx; tz = -dz; ty = t.pos.y + 6.5; spd = e.d.speed * .9; if (e.mt <= 0) { e.mode = 'orbit'; e.mt = rand(2.5, 4.5); e.strafe *= -1; } }
    }
    if (e.stun > 0) { e.stun -= dt; spd = 0; ty = f + .5; }
    const hl = Math.hypot(tx, tz) || 1, vy = clamp((ty - e.pos.y) * 2.2, -7, 6);
    e.vel.x += (tx / hl * spd - e.vel.x) * Math.min(1, dt * 3); e.vel.z += (tz / hl * spd - e.vel.z) * Math.min(1, dt * 3); e.vy += (vy - e.vy) * Math.min(1, dt * 3);
    world.move(e.pos, e.vel.x * dt, e.vel.z * dt, .4 * s, 60);
    e.pos.y = clamp(e.pos.y + e.vy * dt, f + .4, ceil - .8);
    const sp = Math.hypot(e.vel.x, e.vel.z);
    e.yaw = angLerp(e.yaw, face ? Math.atan2(dx, dz) : sp > .3 ? Math.atan2(e.vel.x, e.vel.z) : e.yaw, dt * 6);
    a.root.position.copy(e.pos); a.root.rotation.y = e.yaw; a.root.rotation.x = clamp(-e.vy * .08, -.6, .8);
    a.anim(dt, .5); a.flap(e.ft);
  }

  // frappe au sol de la Méga-soldate : onde de choc, on l'évite en sautant
  function slam(e, dt, t, dist, out) {
    if (e.slam > 0) {
      e.slam -= dt; out.spd = 0; out.face = true; e.ant.setOpen(.8);
      e.ant.root.rotation.x = -.45 * Math.sin(Math.min(1, (.8 - e.slam) / .8) * Math.PI * .5);
      if (e.slam <= 0) {
        e.ant.root.rotation.x = 0; FX.shock(e.pos, 5.5); SFX.boom(e.pos.distanceTo(P.pos)); FX.shake = Math.max(FX.shake, clamp(1 - e.pos.distanceTo(P.pos) / 14, 0, 1));
        for (const tg of EN.targets()) {
          const d = Math.hypot(tg.pos.x - e.pos.x, tg.pos.z - e.pos.z);
          if (d < 5 && (tg !== P || P.onGround)) { tg.damage(22, e.pos); const k = d || 1; tg.vel.x += (tg.pos.x - e.pos.x) / k * 9; tg.vel.z += (tg.pos.z - e.pos.z) / k * 9; if (tg === P) P.vel.y = 4; }
        }
        e.slamCd = rand(5, 7);
      }
      return true;
    }
    e.slamCd -= dt;
    if (e.slamCd <= 0 && e.seen && dist < 6) { e.slam = .8; SFX.roar(); return true; }
    return false;
  }

  function boss(e, dt, t, dist, dx, dz, out) {
    const b = e.b || (e.b = { spit: 3, charge: 6, mode: 'chase', t: 0, p1: false, p2: false, stuns: 0 });
    b.t -= dt;
    if (!b.p1 && e.hp < e.max * .6) { b.p1 = true; G.event('boss60', e); }
    if (!b.p2 && e.hp < e.max * .3) { b.p2 = true; G.event('boss30', e); }
    if (e.stun > 0) { e.stun -= dt; e.ant.setOpen(.05); out.spd = 0; return; }
    if (b.mode === 'wind') {
      out.spd = 0; out.face = true; e.ant.setOpen(.75);
      if (b.t <= 0) { b.mode = 'charge'; b.t = 1.15; const k = Math.hypot(dx, dz) || 1; b.dx = dx / k; b.dz = dz / k; b.hitP = false; }
      return;
    }
    if (b.mode === 'charge') {
      out.tx = b.dx; out.tz = b.dz; out.spd = 17; out.charge = true; e.ant.setOpen(.6);
      if (!b.hitP && dist < 3.4) { b.hitP = true; t.damage(34, e.pos); t.vel.x += b.dx * 14; t.vel.z += b.dz * 14; if (t === P) { P.vel.y = 4; FX.shake = 1; } }
      if (b.t <= 0) b.mode = 'chase';
      return;
    }
    out.face = dist < 9;
    const [px, pz] = pathDir(e, t, dist); out.tx = px; out.tz = pz; out.spd = e.d.speed;
    if (dist < e.d.reach) { out.spd = 0; out.face = true; if (e.atk <= 0 && e.cd <= 0) { e.atk = .45; e.ant.setOpen(.8); } }
    b.spit -= dt; b.charge -= dt;
    if (b.spit <= 0 && e.seen && dist > 6) { b.spit = b.p2 ? 3.2 : 4.5; for (let i = -2; i <= 2; i++) { spitAt(e, t, 20, .05, 12); V2.applyAxisAngle(UPV, i * .14); FX.projs[FX.projs.length - 1].vel.copy(V2); } }
    if (b.charge <= 0 && e.seen && dist > 9) { b.charge = b.p2 ? 5.5 : 7.5; b.mode = 'wind'; b.t = .9; SFX.roar(); }
  }

  const out = { tx: 0, tz: 0, spd: 0, face: false, charge: false };
  EN.update = (dt, passive) => {
    if (!passive) { EN.flowT -= dt; if (EN.flowT <= 0) { EN.flowT = .4; world.flow(P.pos.x, P.pos.z); } }
    for (let i = EN.list.length - 1; i >= 0; i--) {
      const e = EN.list[i], a = e.ant, s = e.d.scale;
      if (e.dead) {
        if (e.d.fly) { const g = world.floorAt(e.pos.x, e.pos.z); if (e.pos.y > g) { e.vy -= 14 * dt; e.pos.y = Math.max(g, e.pos.y + e.vy * dt); } }
        e.deadT += dt; const k = Math.min(1, e.deadT / .35);
        a.root.rotation.z = k * Math.PI; a.root.rotation.x = 0; a.root.position.y = e.pos.y + .78 * s * k;
        a.setCurl(Math.min(1, e.deadT / 1.2)); a.anim(dt, Math.max(0, 1.5 - e.deadT) * 3);
        const b = clamp((e.deadT - .15) / 1.3, 0, 1), ember = Math.sin(Math.PI * b) * (1 - b * .5);
        a.setBurn(b); for (const m of a.mats) m.emissive.setRGB(ember * .55, ember * .14, 0);
        if (b > 0 && b < 1 && Math.random() < dt * 14 * s) FX.glow.spawn(e.pos.x + rand(-.3, .3) * s, a.root.position.y + rand(-.1, .3) * s, e.pos.z + rand(-.3, .3) * s, rand(-.2, .2), rand(.4, 1.2), rand(-.2, .2), rand(.4, .9), rand(.04, .09) * s, FX.COL.fire);
        if (e.deadT > 3.4) {
          const f = clamp(1 - (e.deadT - 3.4) / 1.6, 0, 1);
          a.setFade(f); a.root.scale.setScalar(s * (.55 + .45 * f));
          if (Math.random() < dt * 40 * s) FX.dust.spawn(e.pos.x + rand(-.4, .4) * s, a.root.position.y + rand(-.3, .2) * s, e.pos.z + rand(-.4, .4) * s, rand(-.3, .3), rand(.3, 1), rand(-.3, .3), rand(1, 2), rand(.15, .35) * s, FX.COL.ash, { grow: 1.2, drag: 1.5, a: .7 });
        }
        if (e.deadT > 5.1) { scene.remove(a.root); a.mats.forEach(m => m.dispose()); EN.list.splice(i, 1); }
        continue;
      }
      e.flash = Math.max(0, e.flash - dt * 5); for (const m of a.mats) m.emissive.setRGB(e.flash * .9, e.flash * .25, 0);
      e.cd -= dt; e.losT -= dt; e.tgtT -= dt;
      e.neutral = !!e.col && !COL.isWar(e.col);
      if (!passive && e.tgtT <= 0) { e.tgtT = .4; pickTarget(e); }
      const t = passive || e.neutral ? null : e.tgt && !(e.tgt.dead || e.tgt.down) ? e.tgt : null;
      const dx = t ? t.pos.x - e.pos.x : 0, dz = t ? t.pos.z - e.pos.z : 0, dist = t ? Math.hypot(dx, dz) : 1e9;
      if (!t) e.seen = false;
      else if (e.losT <= 0) {
        e.losT = .2 + Math.random() * .2;
        e.seen = dist < e.d.sight && world.los(V2.set(e.pos.x, e.pos.y + .5 * s, e.pos.z), tCenter(t, V1).setY(t.pos.y + .6));
        if (e.seen) { e.lastX = t.pos.x; e.lastZ = t.pos.z; }
      }
      if (e.pend > 0) { e.pend -= dt; if (e.pend <= 0) EN.alert(e); }
      if (e.neutral) e.alert = false;
      else if (!passive && !e.alert && e.seen && (dist < e.d.sight * .6 || e.d.boss || e.d.queen)) EN.alert(e);
      if (e.d.fly) { flyer(e, dt, t, dist, dx, dz, passive); continue; }
      if (e.stun > 0 && !e.d.boss) {
        e.stun -= dt; a.anim(dt, 0, null); a.setOpen(.4); a.root.rotation.z = Math.sin(e.stun * 40) * .05;
        for (const m of a.mats) m.emissive.setRGB(.05, .12, .25);
        if (e.stun <= 0) a.root.rotation.z = 0;
        continue;
      }

      out.tx = 0; out.tz = 0; out.spd = 0; out.face = false; out.charge = false;
      if (e.d.queen) {
        // reine ennemie : immobile, mord ce qui s'approche et appelle des gardes
        out.spd = 0; out.face = !!t && dist < 14;
        if (t && dist < e.d.reach && e.atk <= 0 && e.cd <= 0) { e.atk = .5; a.setOpen(.8); }
        e.guardT = (e.guardT || 8) - dt;
        if (t && e.guardT <= 0 && EN.list.filter(o => !o.dead && o.col === e.col).length < 16) { e.guardT = 14; for (let k = 0; k < 2; k++) EN.alert(EN.spawn(Math.random() < .3 ? 'spitter' : 'soldier', e.pos.x + rand(-6, 6), e.pos.z - 6, { col: e.col, body: e.body, gaster: e.gaster })); SFX.roar(); }
      }
      else if (e.d.boss && t) boss(e, dt, t, dist, dx, dz, out);
      else if (!e.alert || !t) {
        e.wait -= dt;
        if (!e.wander || Math.hypot(e.wander[0] - e.pos.x, e.wander[1] - e.pos.z) < .8) {
          if (!e.wander || e.wait <= 0) {
            for (let k = 0; k < 6; k++) { const a2 = rand(0, 6.28), r = rand(2, 9), x = e.home.x + Math.cos(a2) * r, z = e.home.z + Math.sin(a2) * r; if (world.walkable(x, z, e.pos.y + 2, 3)) { e.wander = [x, z]; break; } }
            e.wait = rand(1, 4);
          }
        } else { out.tx = e.wander[0] - e.pos.x; out.tz = e.wander[1] - e.pos.z; out.spd = e.d.speed * .3; }
      } else if (e.d.armored && slam(e, dt, t, dist, out)) {
        // la frappe au sol occupe la Méga-soldate
      } else if (e.d.ranged && e.seen && dist < e.d.sight) {
        out.face = true; e.strafeT -= dt; if (e.strafeT <= 0) { e.strafeT = rand(1, 2.5); e.strafe *= -1; }
        const k = dist || 1, fx = dx / k, fz = dz / k;
        if (dist > 15) { out.tx = fx; out.tz = fz; out.spd = e.d.speed; }
        else if (dist < 7) { out.tx = -fx; out.tz = -fz; out.spd = e.d.speed * .9; }
        else { out.tx = -fz * e.strafe; out.tz = fx * e.strafe; out.spd = e.d.speed * .6; }
        if (e.cd <= 0) { e.cd = e.d.cd * rand(.85, 1.2); e.lift = 1.1; spitAt(e, t, 22, .03, e.d.dmg); }
      } else {
        if (dist < e.d.reach) { out.face = true; if (e.atk <= 0 && e.cd <= 0) { e.atk = .3; a.setOpen(.75); } }
        else { const [px, pz] = pathDir(e, t, dist); out.tx = px; out.tz = pz; out.spd = e.d.speed; out.face = e.seen && dist < 4; }
      }
      // morsure
      if (e.atk > 0) {
        e.atk -= dt; out.spd = Math.min(out.spd, .5);
        if (e.atk <= 0) {
          a.setOpen(.05); e.cd = e.d.cd;
          if (t && dist < e.d.reach + .5 && Math.abs(t.pos.y - e.pos.y) < 1.5 * s) { t.damage(e.d.dmg, e.pos); SFX.bite(); }
          setTimeout(() => a.setOpen(.12), 150);
        }
      }
      // déplacement (avec contournement quand une plante ou un caillou bloque)
      if (e.detour > 0) { e.detour -= dt; const c = Math.cos(e.detA), sn = Math.sin(e.detA), x = out.tx * c - out.tz * sn; out.tz = out.tx * sn + out.tz * c; out.tx = x; }
      const k = Math.hypot(out.tx, out.tz);
      const tvx = k > 1e-3 ? out.tx / k * out.spd : 0, tvz = k > 1e-3 ? out.tz / k * out.spd : 0;
      const acc = out.charge ? 20 : 6;
      e.vel.x += (tvx - e.vel.x) * Math.min(1, dt * acc); e.vel.z += (tvz - e.vel.z) * Math.min(1, dt * acc);
      for (const o of EN.list) {
        if (o === e || o.dead || o.d.fly) continue;
        const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, d = Math.hypot(ox, oz), m = (s + o.d.scale) * .55;
        if (d < m && d > 1e-3) { e.vel.x += ox / d * (m - d) * 4; e.vel.z += oz / d * (m - d) * 4; }
      }
      // repousse des cibles : par la vitesse (jamais en téléportant dans un mur)
      for (const tg of EN.targets()) { const ox = e.pos.x - tg.pos.x, oz = e.pos.z - tg.pos.z, d = Math.hypot(ox, oz), m = .45 + .45 * s; if (d < m && d > 1e-3 && Math.abs(tg.pos.y - e.pos.y) < 1.5 * s) { e.vel.x += ox / d * (m - d) * 8; e.vel.z += oz / d * (m - d) * 8; } }
      const ox = e.pos.x, oz = e.pos.z;
      world.move(e.pos, e.vel.x * dt, e.vel.z * dt, .5 * s, .55 * s);
      // le corps entier doit rester dans l'espace libre : sinon on annule le pas et on ressort du mur
      if (!world.bodyFree(e.pos, e.yaw, s)) { e.pos.x = ox; e.pos.z = oz; e.vel.multiplyScalar(.3); }
      world.unstick(e.pos, e.yaw, s);
      const moved = Math.hypot(e.pos.x - ox, e.pos.z - oz);
      if (out.spd > 1 && !out.charge && !e.atk) {
        if (moved < out.spd * dt * .25) e.stuckT = (e.stuckT || 0) + dt; else e.stuckT = Math.max(0, (e.stuckT || 0) - dt * 2);
        if (e.stuckT > .4) { e.stuckT = 0; e.detour = rand(.6, 1.1); e.detA = (Math.random() < .5 ? 1 : -1) * rand(1.1, 1.9); e.vel.multiplyScalar(.3); }
      }
      if (out.charge && moved < out.spd * dt * .3) { e.stun = 2.2; e.b.mode = 'chase'; e.b.stuns++; FX.shake = Math.max(FX.shake, .9); SFX.boom(dist); G.event('bossStun', e); }
      if (dt > 0 && !out.charge) { const rv = moved / dt; if (rv < Math.hypot(e.vel.x, e.vel.z) * .5) { e.vel.x *= .5; e.vel.z *= .5; } }
      const gy = world.groundAt(e.pos.x, e.pos.z, e.pos.y + .5 * s);
      e.pos.y += (gy - e.pos.y) * Math.min(1, dt * 14);
      const sp = Math.hypot(e.vel.x, e.vel.z);
      const faceYaw = out.face && t ? Math.atan2(dx, dz) : sp > .3 ? Math.atan2(e.vel.x, e.vel.z) : e.yaw;
      e.yaw = angLerp(e.yaw, faceYaw, dt * (out.charge ? 2 : 6));
      a.root.position.copy(e.pos); a.root.rotation.y = e.yaw;
      if (!a.ik && !e.slam) { const fx = Math.sin(e.yaw) * .5 * s, fz = Math.cos(e.yaw) * .5 * s; a.root.rotation.x = angLerp(a.root.rotation.x, -Math.atan2(world.floorAt(e.pos.x + fx, e.pos.z + fz) - world.floorAt(e.pos.x - fx, e.pos.z - fz), s), dt * 6); }
      e.lift = Math.max(0, e.lift - dt * 2.5); a.setLift(e.lift);
      a.anim(dt, sp / s, e.vel);
    }
  };
})();
