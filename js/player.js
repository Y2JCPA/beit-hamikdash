// Player controller, third-person camera, and animal followers.
import * as THREE from 'three';
import { PLAYER, HEICHAL } from './config.js';
import { makeCharacter, makeItem, makeAnimal, disposeBaked } from './characters.js';
import { audio } from './audio.js';

const tmpV = new THREE.Vector3();

export class Player {
  constructor(scene, physics, look) {
    this.scene = scene;
    this.physics = physics;
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.onGround = true;
    this.facing = 0;
    this.visualY = 0;
    this.lastSafe = new THREE.Vector3();
    this.heldKinds = [];
    this.followers = [];
    this.frozen = false;
    this.setLook(look);
  }

  setLook(look) {
    if (this.char) { this.scene.remove(this.char.group); disposeBaked(this.char.group); }
    this.look = look;
    this.char = makeCharacter({ role: look.kohenGadol ? 'kohenGadol' : 'kohen', skin: look.skin, hair: look.hair, scale: 0.95 });
    this.char.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(this.char.group);
    const kinds = this.heldKinds; this.heldKinds = [];
    this.setHeld(kinds);
  }

  teleport(x, y, z, facing) {
    this.pos.set(x, y, z);
    this.visualY = y;
    this.vel.set(0, 0, 0); this.vy = 0;
    if (facing !== undefined) this.facing = facing;
    this.lastSafe.copy(this.pos);
    this.followers.forEach((f, i) => { f.pos.set(x - 1 - i, y, z + 1); });
    this.sync();
  }

  setHeld(kinds) {
    kinds = (kinds || []).filter(Boolean);
    if (kinds.join() === this.heldKinds.join()) return;
    this.heldKinds = kinds.slice();
    const g = new THREE.Group();
    kinds.forEach((k, i) => {
      const it = makeItem(k);
      it.position.x = kinds.length > 1 ? (i - (kinds.length - 1) / 2) * 0.42 : 0;
      g.add(it);
      g.userData[k] = it;
    });
    disposeBaked(this.heldGroup);
    this.char.setHeld(kinds.length ? g : null);
    this.heldGroup = kinds.length ? g : null;
  }
  heldItem(kind) { return this.heldGroup?.userData[kind]; }
  isHolding(kind) { return this.heldKinds.includes(kind); }

  addFollower(type) {
    const a = makeAnimal(type);
    a.pos = this.pos.clone().add(new THREE.Vector3(-Math.sin(this.facing) * 1.6, 0, -Math.cos(this.facing) * 1.6));
    a.facing = this.facing;
    a.pos.y = this.physics.groundAt(a.pos.x, a.pos.z, this.pos.y + 0.3, 0.8);
    a.group.position.copy(a.pos); a.group.rotation.y = a.facing; a.baseY = a.pos.y;
    a.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.scene.add(a.group);
    this.followers.push(a);
    return a;
  }
  removeFollower(a) {
    a = a || this.followers[0];
    if (!a) return;
    this.scene.remove(a.group);
    disposeBaked(a.group);
    this.followers = this.followers.filter(f => f !== a);
  }

  get inHeichal() {
    const H = HEICHAL;
    return this.pos.x < H.frontWallX1 && this.pos.x > H.hallMinX - 1 && Math.abs(this.pos.z) < H.hallHalfW + 0.5 && this.pos.y > 2;
  }
  get feet() { return this.pos.y; }

  update(dt, input, camYaw) {
    const P = PLAYER;
    const auto = !this.frozen && this.autoDir;
    const mv = this.frozen ? { x: 0, y: 0, run: false } : auto ? { x: 0, y: 0, run: true } : input.move();
    const carefully = this.heldKinds.includes('mizrak');
    const maxSpeed = (mv.run && !carefully ? P.sprint : P.walk) * (carefully ? 0.8 : 1);
    // camera-relative direction
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let dx = fx * mv.y + rx * mv.x, dz = fz * mv.y + rz * mv.x;
    if (auto) { dx = this.autoDir.x; dz = this.autoDir.z; }
    const mag = Math.hypot(dx, dz);
    const want = mag > 0.05;
    if (want) { dx /= Math.max(1, mag); dz /= Math.max(1, mag); }
    const tvx = dx * maxSpeed, tvz = dz * maxSpeed;
    const acc = want ? P.accel : P.decel;
    this.vel.x += (tvx - this.vel.x) * Math.min(1, acc * dt / Math.max(1, maxSpeed) * 1.6);
    this.vel.z += (tvz - this.vel.z) * Math.min(1, acc * dt / Math.max(1, maxSpeed) * 1.6);
    if (!want && Math.hypot(this.vel.x, this.vel.z) < 0.05) { this.vel.x = 0; this.vel.z = 0; }

    // horizontal move with collision
    const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.z * dt;
    const feet = this.pos.y;
    if (!this.physics.surfaceBlocks(nx, nz, feet, P.step)) { this.pos.x = nx; this.pos.z = nz; }
    else if (!this.physics.surfaceBlocks(nx, this.pos.z, feet, P.step)) { this.pos.x = nx; this.vel.z = 0; }
    else if (!this.physics.surfaceBlocks(this.pos.x, nz, feet, P.step)) { this.pos.z = nz; this.vel.x = 0; }
    else { this.vel.x = this.vel.z = 0; }
    this.physics.resolve(this.pos, this.pos.y, P.radius, P.height, P.step);

    // vertical
    const ground = this.physics.groundAt(this.pos.x, this.pos.z, this.pos.y, P.step);
    if (input.jumpPressed && this.onGround && !this.frozen && !carefully) { this.vy = P.jump; this.onGround = false; }
    if (this.vy > 0 || this.pos.y > ground + 0.02) {
      this.vy -= P.gravity * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) { this.pos.y = ground; this.vy = 0; this.onGround = true; }
      else this.onGround = false;
    } else {
      this.pos.y = ground; this.vy = 0; this.onGround = true;
    }
    if (this.onGround) this.lastSafe.copy(this.pos);
    if (this.pos.y < -5.8) this.teleport(this.lastSafe.x, this.lastSafe.y, this.lastSafe.z);

    // facing & animation
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      const d = Math.atan2(Math.sin(target - this.facing), Math.cos(target - this.facing));
      this.facing += d * Math.min(1, dt * 12);
    }
    // smooth step-ups visually
    this.visualY += (this.pos.y - this.visualY) * Math.min(1, dt * 18);
    if (Math.abs(this.pos.y - this.visualY) > 1.2) this.visualY = this.pos.y;
    this.char.update(dt, this.onGround ? sp : 0);
    if (this.look.kohenGadol && sp > 1 && this.onGround) {
      this.bellT = (this.bellT || 0) + dt * sp;
      if (this.bellT > 1.6) { this.bellT = 0; audio.play('jingle'); }
    }
    this.sync();
    this.updateFollowers(dt);
    this.speed = sp;
  }

  sync() {
    this.char.group.position.set(this.pos.x, this.visualY, this.pos.z);
    this.char.group.rotation.y = this.facing;
  }

  updateFollowers(dt) {
    this.followers.forEach((a, i) => {
      if (a.parked) { a.group.position.copy(a.pos); a.group.rotation.y = a.facing; a.update(dt, 0); return; }
      const back = 1.5 + i * 1.3;
      const tx = this.pos.x - Math.sin(this.facing) * back, tz = this.pos.z - Math.cos(this.facing) * back;
      const dx = tx - a.pos.x, dz = tz - a.pos.z;
      const d = Math.hypot(dx, dz);
      let sp = 0;
      if (d > 0.4) {
        sp = Math.min(9, d * 2.6);
        a.pos.x += (dx / d) * sp * dt; a.pos.z += (dz / d) * sp * dt;
        const f = Math.atan2(dx, dz);
        a.facing += Math.atan2(Math.sin(f - a.facing), Math.cos(f - a.facing)) * Math.min(1, dt * 8);
      }
      if (d > 14) { a.pos.set(tx, this.pos.y, tz); }
      const g = this.physics.groundAt(a.pos.x, a.pos.z, Math.max(a.pos.y, this.pos.y) + 0.3, 0.8);
      a.pos.y += (g - a.pos.y) * Math.min(1, dt * 12);
      a.group.position.set(a.pos.x, a.pos.y, a.pos.z);
      a.baseY = a.pos.y;
      a.group.rotation.y = a.facing;
      a.update(dt, sp);
    });
  }
}

// ─────────────────────────────────────────────────────────
// Third-person camera with collision & smoothing
// ─────────────────────────────────────────────────────────
export class CameraRig {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = Math.PI / 2;
    this.pitch = 0.32;
    this.dist = 7.5;
    this.curDist = 7.5;
    this.target = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.override = null;        // cinematic pose {pos, look}
    this.sens = 1;
    this.mode = 'follow';
    this.followDelay = 1.2;   // seconds after the player last dragged the view
    this.followRate = 0.9;    // how quickly the camera swings behind a walking player
  }

  snap(player) {
    this.smoothTarget.set(player.pos.x, player.visualY + 1.45, player.pos.z);
    this.update(0.016, player, { lookDX: 0, lookDY: 0, zoom: 0 }, true);
  }

  update(dt, player, input, snap = false) {
    if (this.override) {
      this.camera.position.copy(this.override.pos);
      this.camera.lookAt(this.override.look);
      return;
    }
    const s = 0.0042 * this.sens;
    this.yaw -= input.lookDX * s;
    this.pitch = Math.max(-0.35, Math.min(1.25, this.pitch + input.lookDY * s));
    const inside = player.inHeichal;
    const maxD = inside ? 6 : 14;
    this.dist = Math.max(2.4, Math.min(maxD, this.dist + input.zoom * 0.7));
    // gentle auto-follow behind the player when walking forward-ish and not dragging
    const now = performance.now() / 1000;
    if (player.speed > 1.5 && now - input.lastLookAt > this.followDelay) {
      const behind = player.facing + Math.PI;
      const d = Math.atan2(Math.sin(behind - this.yaw), Math.cos(behind - this.yaw));
      if (Math.abs(d) < 2.2 || player.autoDir) this.yaw += d * Math.min(1, dt * (player.autoDir ? 2.4 : this.followRate));
    }
    const tx = player.pos.x, ty = player.visualY + 1.45, tz = player.pos.z;
    const k = snap ? 1 : Math.min(1, dt * 12);
    this.smoothTarget.x += (tx - this.smoothTarget.x) * k;
    this.smoothTarget.y += (ty - this.smoothTarget.y) * Math.min(1, dt * 8);
    this.smoothTarget.z += (tz - this.smoothTarget.z) * k;
    const t = this.smoothTarget;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const dir = tmpV.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp);
    let want = this.dist;
    const hit = this.physics.rayCast(t, dir, want + 0.4);
    if (hit < want + 0.4) want = Math.max(1.2, hit - 0.45);
    this.curDist += (want - this.curDist) * (want < this.curDist ? 1 : Math.min(1, dt * 4));
    const cam = this.camera.position;
    cam.set(t.x + dir.x * this.curDist, t.y + dir.y * this.curDist, t.z + dir.z * this.curDist);
    const gy = this.physics.groundAt(cam.x, cam.z, cam.y, 0) + 0.3;
    if (cam.y < gy) cam.y = gy;
    this.camera.lookAt(t.x, t.y + 0.1, t.z);
  }
}
