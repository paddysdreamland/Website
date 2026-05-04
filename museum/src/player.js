import * as THREE from 'three'

const SPEED       = 4.2
const SPRINT_MULT = 1.7
const SENSITIVITY = 0.0018
const HEIGHT      = 1.7
const DAMPING     = 12

// Player capsule dimensions
const HALF_W = 0.35   // half-width of the bounding box (x/z)
const HALF_H = 0.85   // half-height (y) — box goes from HEIGHT-HALF_H to HEIGHT+HALF_H

export class Player {
  constructor(camera, domElement) {
    this.camera     = camera
    this.domElement = domElement

    this.velocity  = new THREE.Vector3()
    this.moveInput = new THREE.Vector3()

    this.yaw   = 0
    this.pitch = 0
    this.locked = false

    this.keys = { w: false, a: false, s: false, d: false, shift: false }

    this._onKeyDown    = this._onKeyDown.bind(this)
    this._onKeyUp      = this._onKeyUp.bind(this)
    this._onMouseMove  = this._onMouseMove.bind(this)
    this._onLockChange = this._onLockChange.bind(this)

    document.addEventListener('keydown',           this._onKeyDown)
    document.addEventListener('keyup',             this._onKeyUp)
    document.addEventListener('mousemove',          this._onMouseMove)
    document.addEventListener('pointerlockchange', this._onLockChange)

    this.camera.position.set(0, HEIGHT, 6)
    this.yaw = Math.PI
  }

  lock()   { this.domElement.requestPointerLock() }
  unlock() { document.exitPointerLock() }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.domElement
    document.body.classList.toggle('locked', this.locked)
    document.getElementById('overlay').classList.toggle('hidden', this.locked)
  }

  _onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':         this.keys.w     = true;  break
      case 'KeyS': case 'ArrowDown':       this.keys.s     = true;  break
      case 'KeyA': case 'ArrowLeft':       this.keys.a     = true;  break
      case 'KeyD': case 'ArrowRight':      this.keys.d     = true;  break
      case 'ShiftLeft': case 'ShiftRight': this.keys.shift = true;  break
      case 'KeyE': document.dispatchEvent(new CustomEvent('player:interact')); break
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':         this.keys.w     = false; break
      case 'KeyS': case 'ArrowDown':       this.keys.s     = false; break
      case 'KeyA': case 'ArrowLeft':       this.keys.a    = false; break
      case 'KeyD': case 'ArrowRight':      this.keys.d     = false; break
      case 'ShiftLeft': case 'ShiftRight': this.keys.shift = false; break
    }
  }

  _onMouseMove(e) {
    if (!this.locked) return
    this.yaw   -= e.movementX * SENSITIVITY
    this.pitch -= e.movementY * SENSITIVITY
    this.pitch  = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, this.pitch))
  }

  // Returns the 8 corners of the player bounding box at a given position
  _corners(pos) {
    const cx = pos.x, cy = pos.y, cz = pos.z
    return [
      new THREE.Vector3(cx - HALF_W, cy - HALF_H + 0.05, cz - HALF_W),
      new THREE.Vector3(cx + HALF_W, cy - HALF_H + 0.05, cz - HALF_W),
      new THREE.Vector3(cx - HALF_W, cy - HALF_H + 0.05, cz + HALF_W),
      new THREE.Vector3(cx + HALF_W, cy - HALF_H + 0.05, cz + HALF_W),
      new THREE.Vector3(cx - HALF_W, cy + HALF_H - 0.05, cz - HALF_W),
      new THREE.Vector3(cx + HALF_W, cy + HALF_H - 0.05, cz - HALF_W),
      new THREE.Vector3(cx - HALF_W, cy + HALF_H - 0.05, cz + HALF_W),
      new THREE.Vector3(cx + HALF_W, cy + HALF_H - 0.05, cz + HALF_W),
    ]
  }

  // From each corner, sweep in the movement direction by reach distance
  // reach = how far the player is about to move this frame, so fast movement
  // can never tunnel through geometry thinner than that distance
  _blocked(pos, xSign, zSign, reach, walls) {
    const ray = new THREE.Raycaster()
    ray.near = 0
    ray.far  = reach

    const dirs = []
    if (xSign !== 0) dirs.push(new THREE.Vector3(xSign, 0, 0))
    if (zSign !== 0) dirs.push(new THREE.Vector3(0, 0, zSign))
    if (xSign !== 0 && zSign !== 0)
      dirs.push(new THREE.Vector3(xSign, 0, zSign).normalize())

    for (const corner of this._corners(pos)) {
      for (const dir of dirs) {
        ray.set(corner, dir)
        if (ray.intersectObjects(walls, true).length > 0) return true
      }
    }
    return false
  }

  update(dt, walls = []) {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
    if (!this.locked) return

    const speed   = SPEED * (this.keys.shift ? SPRINT_MULT : 1)
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
    const right   = new THREE.Vector3( Math.cos(this.yaw), 0, -Math.sin(this.yaw))

    this.moveInput.set(0, 0, 0)
    if (this.keys.w) this.moveInput.addScaledVector(forward,  1)
    if (this.keys.s) this.moveInput.addScaledVector(forward, -1)
    if (this.keys.a) this.moveInput.addScaledVector(right,   -1)
    if (this.keys.d) this.moveInput.addScaledVector(right,    1)
    if (this.moveInput.lengthSq() > 0) this.moveInput.normalize()

    this.velocity.lerp(
      this.moveInput.clone().multiplyScalar(speed),
      1 - Math.exp(-DAMPING * dt)
    )

    // Skip collision entirely if barely moving
    if (this.velocity.lengthSq() < 0.0001) return

    let vx = this.velocity.x * dt
    let vz = this.velocity.z * dt

    const pos = this.camera.position.clone()

    // Test X axis — cast from all 8 corners in movement X direction
    const xSign = Math.sign(vx)
    const zSign = Math.sign(vz)
    const xReach = Math.abs(vx)
    const zReach = Math.abs(vz)
    const dReach = Math.sqrt(xReach * xReach + zReach * zReach)

    // Test X — corners are already at box edge, reach is just the movement delta
    if (vx !== 0 && this._blocked(pos, xSign, 0, xReach, walls)) vx = 0
    // Test Z
    if (vz !== 0 && this._blocked(pos, 0, zSign, zReach, walls)) vz = 0
    // Test diagonal — catches corner clips when moving at an angle
    if (vx !== 0 && vz !== 0 && this._blocked(pos, xSign, zSign, dReach, walls)) {
      vx = 0
      vz = 0
    }

    this.camera.position.x += vx
    this.camera.position.z += vz
    this.camera.position.y  = HEIGHT
  }

  get position() { return this.camera.position }

  dispose() {
    document.removeEventListener('keydown',           this._onKeyDown)
    document.removeEventListener('keyup',             this._onKeyUp)
    document.removeEventListener('mousemove',          this._onMouseMove)
    document.removeEventListener('pointerlockchange', this._onLockChange)
  }
}
