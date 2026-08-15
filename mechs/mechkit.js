// mechkit — drive an exported ROBOTWORLD mech in any three.js project.
//
// It imports NOTHING. You hand it the THREE namespace and a GLTFLoader that
// your project already resolves, so there is no second copy of three, no
// version to match and no build step:
//
//   import * as THREE from 'three';
//   import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
//   import { MechKit } from './mechs/mechkit.js';
//
//   const kit  = new MechKit({ THREE, GLTFLoader, path: './mechs/' });
//   const mech = await kit.load('titanus');
//   scene.add(mech.object);
//
//   mech.loop('run');                 // the gait, looping
//   mech.play('taunt');               // a one-shot, then back to whatever loops
//   mech.anchor('muzzleR');           // Object3D that rides the barrel
//   mech.bone('handR');               // any of the 15 game joints, by name
//   // in your frame loop:
//   mech.update(dt);
//
// WHAT AN EXPORTED MECH GUARANTEES, so you can build on it:
//   · native units are GAME units, +z is forward, the feet rest on y = 0
//   · the skeleton carries the 15 game joints by name — hips, torso, head,
//     shoulderL/R, elbowL/R, handL/R, thighL/R, kneeL/R, ankleL/R — plus
//     whatever else that body has (tails, claws, chimneys)
//   · every anchor is an empty node named `anchor_<name>`: muzzleR / muzzleL
//     are where shots leave, boostL / boostR are the foot jets, core and
//     overhead are the chest and the crown. Some mechs carry more.
//   · `walk` and `run` are looping gait cycles; everything else is a one-shot
//     action clip named for what it is (light1, heavy, block, taunt, dead …)
export class MechKit {
  constructor({ THREE, GLTFLoader, path = './' }) {
    if (!THREE || !GLTFLoader) throw new Error('MechKit needs { THREE, GLTFLoader }');
    this.THREE = THREE;
    this.loader = new GLTFLoader();
    this.path = path.endsWith('/') ? path : path + '/';
    this._index = null;
  }

  /** The manifest of what is in this directory: mechs, their clips, anchors. */
  async index() {
    if (!this._index) {
      const r = await fetch(this.path + 'index.json');
      if (!r.ok) throw new Error(`no index.json at ${this.path}`);
      this._index = await r.json();
    }
    return this._index;
  }

  async load(id) {
    const gltf = await new Promise((ok, no) =>
      this.loader.load(`${this.path}${id}.glb`, ok, undefined, no));
    return new Mech(this.THREE, id, gltf);
  }
}

class Mech {
  constructor(THREE, id, gltf) {
    this.THREE = THREE;
    this.id = id;
    this.object = gltf.scene;
    this.clips = gltf.animations;
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    this._byName = new Map(gltf.animations.map((c) => [c.name, c]));
    this._bones = new Map();
    this._anchors = new Map();
    gltf.scene.traverse((o) => {
      if (o.isBone) this._bones.set(o.name, o);
      else if (o.name && o.name.startsWith('anchor_')) this._anchors.set(o.name.slice(7), o);
    });
    this._loop = null;     // the action a one-shot returns to
    this._once = null;
    // A one-shot has to hand the body back, and an AnimationMixer will not do
    // it for you: without this the last frame of `taunt` is held forever and
    // the mech never walks again.
    this._onFinish = (e) => {
      if (this._once && e.action === this._once) {
        this._once = null;
        if (this._loop) this._loop.reset().fadeIn(0.15).play();
      }
    };
    this.mixer.addEventListener('finished', this._onFinish);
  }

  bone(name) { return this._bones.get(name) || null; }
  anchor(name) { return this._anchors.get(name) || null; }
  get boneNames() { return [...this._bones.keys()]; }
  get anchorNames() { return [...this._anchors.keys()]; }
  get clipNames() { return [...this._byName.keys()]; }

  /** Play a clip on a loop (the gaits: `walk`, `run`). Cross-fades. */
  loop(name, fade = 0.2) {
    const clip = this._byName.get(name);
    if (!clip) return null;
    const next = this.mixer.clipAction(clip);
    next.setLoop(this.THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = false;
    if (this._loop && this._loop !== next) this._loop.fadeOut(fade);
    next.reset().fadeIn(this._once ? 0 : fade).play();
    if (this._once) next.setEffectiveWeight(0);   // wait for the one-shot
    this._loop = next;
    return next;
  }

  /** Play a clip once, then fall back to whatever was looping. */
  play(name, fade = 0.1) {
    const clip = this._byName.get(name);
    if (!clip) return null;
    const act = this.mixer.clipAction(clip);
    act.setLoop(this.THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    if (this._loop) this._loop.fadeOut(fade);
    if (this._once && this._once !== act) this._once.stop();
    act.reset().fadeIn(fade).play();
    this._once = act;
    return act;
  }

  stop(fade = 0.15) {
    if (this._once) { this._once.fadeOut(fade); this._once = null; }
    if (this._loop) { this._loop.fadeOut(fade); this._loop = null; }
  }

  update(dt) { this.mixer.update(dt); }

  dispose() {
    this.mixer.removeEventListener('finished', this._onFinish);
    this.mixer.stopAllAction();
    this.object.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (!m) return;
      for (const mat of Array.isArray(m) ? m : [m]) {
        for (const k of Object.keys(mat)) if (mat[k]?.isTexture) mat[k].dispose();
        mat.dispose();
      }
    });
  }
}
