'use strict';
// Colonie Noire · escouade : deux soldates noires qui suivent la joueuse, combattent et peuvent être relevées
const ALLY = { list: [], order: 'follow', hold: null, recallT: 0, marker: null };
const ORDERS = { follow: 'Suivre', hold: 'Tenir la position', free: 'Libre' };
(() => {
  const DEFS = [
    { name: 'Nyx', body: '#141313', gaster: '#0b0a0a', head: 1, ranged: true, slot: -1 },
    { name: 'Brume', body: '#1d1712', gaster: '#100c09', head: 1.25, ranged: false, slot: 1 },
  ];
  const V = new T.Vector3(), V2 = new T.Vector3();
  ALLY.clear = () => { for (const a of ALLY.list) scene.remove(a.ant.root); ALLY.list = []; ALLY.order = 'follow'; ALLY.hold = null; ALLY.recallT = 0; if (ALLY.marker) ALLY.marker.visible = false; HUD.allies(); };
  // ordres : Suivre → Tenir la position (là où tu vises) → Libre ; rappel d'urgence
  ALLY.command = () => {
    if (!ALLY.list.length) return;
    const nx = ALLY.order === 'follow' ? 'hold' : ALLY.order === 'hold' ? 'free' : 'follow';
    ALLY.order = nx; ALLY.recallT = 0;
    if (nx === 'hold') {
      const d = new T.Vector3(); cam.getWorldDirection(d);
      const t = Math.min(world.rayBlock(cam.position, d, 22), 22), p = cam.position.clone().addScaledVector(d, Math.max(2, t - .5));
      ALLY.hold = new T.Vector3(p.x, world.groundAt(p.x, p.z, p.y + 1), p.z);
      if (!ALLY.marker) { ALLY.marker = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: '#7dffd0', transparent: true, depthWrite: false, blending: T.AdditiveBlending })); ALLY.marker.scale.set(1.6, 1.6, 1); scene.add(ALLY.marker); }
      ALLY.marker.position.copy(ALLY.hold).y += .4; ALLY.marker.visible = true;
      HUD.say('Brume', 'Compris, on tient cette position.', 2.2);
    } else {
      if (ALLY.marker) ALLY.marker.visible = false;
      HUD.say('Nyx, éclaireuse', nx === 'free' ? 'On chasse autour de toi, sans trop s\'éloigner.' : 'On reste collées à toi.', 2.2);
    }
    HUD.allies(); SFX.pick();
  };
  ALLY.recall = () => {
    if (!ALLY.list.length) return;
    ALLY.order = 'follow'; ALLY.recallT = 3.5; if (ALLY.marker) ALLY.marker.visible = false;
    for (const a of ALLY.list) a.tgt = null;
    HUD.say('Nyx, éclaireuse', 'On arrive !', 1.6); HUD.allies(); SFX.chitter(0);
  };
  ALLY.spawnSquad = () => {
    ALLY.clear();
    if (!G.squad) return;
    for (const d of DEFS) {
      const ant = buildAnt({ body: d.body, gaster: d.gaster, head: d.head });
      const x = P.pos.x + d.slot * 1.8, z = P.pos.z + 1.5;
      const a = {
        d, name: d.name, ant, isAlly: true, pos: new T.Vector3(x, world.groundAt(x, z, 99), z), vel: new T.Vector3(), yaw: P.yaw + Math.PI,
        hp: 160, max: 160, down: false, revive: 0, tgt: null, scan: 0, cd: 0, calm: 0, flash: 0,
        damage(amt, from) {
          if (this.down || G.state !== 'play') return;
          this.hp -= amt * diff().dmg * .8; this.flash = 1; this.calm = 0;
          if (this.hp <= 0) { this.hp = 0; this.down = true; this.revive = 0; this.ant.setCurl(.6); HUD.feed(`${this.name} est à terre : approche-toi pour la relever`); SFX.hurt(); }
          HUD.allies();
        },
      };
      ant.root.scale.setScalar(1); ant.root.position.copy(a.pos); scene.add(ant.root);
      ant.onStep = L => { if (L.i === 0 && cam.position.distanceToSquared(a.pos) < 25) SFX.tap(1); };
      ALLY.list.push(a);
    }
    HUD.allies();
  };
  ALLY.update = dt => {
    ALLY.recallT = Math.max(0, ALLY.recallT - dt);
    if (ALLY.order === 'hold' && ALLY.hold && Math.hypot(P.pos.x - ALLY.hold.x, P.pos.z - ALLY.hold.z) > 35) { ALLY.order = 'follow'; if (ALLY.marker) ALLY.marker.visible = false; HUD.notice('Tu t\'éloignes : l\'escouade te rejoint', 2); HUD.allies(); }
    if (ALLY.marker && ALLY.marker.visible) ALLY.marker.material.opacity = .6 + Math.sin(G.time * 4) * .25;
    const danger = P.hp < P.maxHp * .35, anchor = ALLY.order === 'hold' && ALLY.hold ? ALLY.hold : P.pos;
    const engageR = danger ? 15 : ALLY.order === 'free' ? 22 : ALLY.order === 'hold' ? 9 : 11, leashR = ALLY.order === 'free' ? 26 : ALLY.order === 'hold' ? 11 : 14;
    if (ALLY.list.some(a => a.down) && !ALLY.list.some(a => a.down && a.revive > 0)) HUD.prompt('');
    for (const a of ALLY.list) {
      const ant = a.ant;
      a.flash = Math.max(0, a.flash - dt * 5); for (const m of ant.mats) m.emissive.setRGB(a.flash * .7, a.flash * .1, 0);
      const pd = Math.hypot(P.pos.x - a.pos.x, P.pos.z - a.pos.z);
      if (a.down) {
        if (!P.dead && pd < 1.8) { a.revive += dt; HUD.prompt(`Relève ${a.name}… ${Math.ceil(2 - a.revive)}`); if (a.revive >= 2) { a.down = false; a.hp = a.max * .5; ant.setCurl(0); ant.resetFeet(); a.ant = rebuild(a); HUD.feed(`${a.name} est de retour`); HUD.prompt(''); HUD.allies(); } }
        else a.revive = Math.max(0, a.revive - dt);
        ant.anim(dt, 0, null);
        continue;
      }
      a.cd -= dt; a.scan -= dt; a.calm += dt;
      if (a.calm > 4) a.hp = Math.min(a.max, a.hp + 8 * dt);
      if (a.scan <= 0) {
        a.scan = .3; a.tgt = null; let bd = 1e9;
        for (const e of EN.list) {
          if (e.dead || ALLY.recallT > 0) continue;
          const da = Math.hypot(e.pos.x - (danger ? P.pos.x : anchor.x), e.pos.z - (danger ? P.pos.z : anchor.z)); if (da > engageR) continue;
          const d = e.pos.distanceTo(a.pos) - (danger && e.tgt === P ? 8 : 0); if (d < bd && world.los(V.set(a.pos.x, a.pos.y + .5, a.pos.z), V2.set(e.pos.x, e.pos.y + .5 * e.d.scale, e.pos.z))) { bd = d; a.tgt = e; } }
      }
      let tx = 0, tz = 0, spd = 0, face = null;
      const off = Math.hypot(a.pos.x - anchor.x, a.pos.z - anchor.z);
      if (off > leashR + 4) a.tgt = null;
      const e = a.tgt && !a.tgt.dead && ALLY.recallT <= 0 ? a.tgt : null;
      if (e) {
        a.calm = 0;
        const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z, d = Math.hypot(dx, dz), reach = 1.3 + .7 * e.d.scale;
        face = Math.atan2(dx, dz);
        if (a.d.ranged) {
          if (d > 11) { tx = dx; tz = dz; spd = 5; } else if (d < 4) { tx = -dx; tz = -dz; spd = 4; }
          if (d < 14 && a.cd <= 0) {
            a.cd = .75; ant.root.updateMatrixWorld();
            const m = V.set(0, .42, .62).applyMatrix4(ant.root.matrixWorld), tt = d / 30;
            V2.set(e.pos.x + e.vel.x * tt, e.pos.y + .4 * e.d.scale, e.pos.z + e.vel.z * tt).sub(m).normalize().multiplyScalar(30); V2.y += 2 * tt;
            FX.fire('acid', m, V2, 'a', 9); SFX.spit(a.pos.distanceTo(P.pos) + 6);
          }
        } else if (d > reach) { tx = dx; tz = dz; spd = 5.4; }
        else if (a.cd <= 0) { a.cd = 1; ant.setOpen(.75); setTimeout(() => ant.setOpen(.1), 220); EN.damage(e, 16, false, a.pos); FX.hemo(V.copy(e.pos).setY(e.pos.y + .4 * e.d.scale)); SFX.bite(); }
      } else {
        // formation : derrière la joueuse (suivre, rappel, libre) ou autour du point tenu
        let gx, gz;
        if (ALLY.order === 'hold' && ALLY.hold && ALLY.recallT <= 0) { gx = ALLY.hold.x + a.d.slot * 1.4; gz = ALLY.hold.z + .6; }
        else {
          const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw), bx = Math.sin(P.yaw), bz = Math.cos(P.yaw), sp2 = ALLY.order === 'free' ? 3.2 : 1.9, bk = ALLY.order === 'free' ? 3.5 : 2.1;
          gx = P.pos.x + rx * a.d.slot * sp2 + bx * bk; gz = P.pos.z + rz * a.d.slot * sp2 + bz * bk;
        }
        const d = Math.hypot(gx - a.pos.x, gz - a.pos.z);
        if (d > .7) { tx = gx - a.pos.x; tz = gz - a.pos.z; spd = clamp(d * 1.6, 1.5, ALLY.recallT > 0 ? 11 : 8.5); }
        if (pd > 40 && !(ALLY.order === 'hold' && ALLY.recallT <= 0)) { a.pos.set(gx, world.groundAt(gx, gz, 99), gz); ant.resetFeet(); }
      }
      const k = Math.hypot(tx, tz);
      a.vel.x += ((k ? tx / k * spd : 0) - a.vel.x) * Math.min(1, dt * 6); a.vel.z += ((k ? tz / k * spd : 0) - a.vel.z) * Math.min(1, dt * 6);
      const ox = a.pos.x - P.pos.x, oz = a.pos.z - P.pos.z; if (pd < .9 && pd > 1e-3) { a.pos.x += ox / pd * (.9 - pd); a.pos.z += oz / pd * (.9 - pd); }
      for (const b of ALLY.list) if (b !== a) { const qx = a.pos.x - b.pos.x, qz = a.pos.z - b.pos.z, q = Math.hypot(qx, qz); if (q < .9 && q > 1e-3) { a.pos.x += qx / q * (.9 - q) * .5; a.pos.z += qz / q * (.9 - q) * .5; } }
      const ox0 = a.pos.x, oz0 = a.pos.z;
      if (a.detour > 0) { a.detour -= dt; const c = Math.cos(a.detA), sn = Math.sin(a.detA), vx = a.vel.x * c - a.vel.z * sn; a.vel.z = a.vel.x * sn + a.vel.z * c; a.vel.x = vx; }
      world.move(a.pos, a.vel.x * dt, a.vel.z * dt, .45, .55);
      { const mv = Math.hypot(a.pos.x - ox0, a.pos.z - oz0); if (spd > 1 && mv < spd * dt * .25) a.stuckT = (a.stuckT || 0) + dt; else a.stuckT = 0; if (a.stuckT > .4) { a.stuckT = 0; a.detour = .8; a.detA = (Math.random() < .5 ? 1 : -1) * 1.4; } }
      a.pos.y += (world.groundAt(a.pos.x, a.pos.z, a.pos.y + .5) - a.pos.y) * Math.min(1, dt * 14);
      const sp = Math.hypot(a.vel.x, a.vel.z);
      a.yaw = angLerp(a.yaw, face !== null ? face : sp > .3 ? Math.atan2(a.vel.x, a.vel.z) : a.yaw, dt * 7);
      ant.root.position.copy(a.pos); ant.root.rotation.y = a.yaw;
      ant.anim(dt, sp, a.vel);
    }
  };
  // une alliée relevée retrouve un modèle neuf (la pose « à terre » est abandonnée)
  function rebuild(a) {
    scene.remove(a.ant.root);
    const ant = buildAnt({ body: a.d.body, gaster: a.d.gaster, head: a.d.head });
    ant.root.position.copy(a.pos); ant.root.rotation.y = a.yaw; scene.add(ant.root);
    ant.onStep = a.ant.onStep;
    return ant;
  }
})();
