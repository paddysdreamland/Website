import * as THREE from 'three'

const SPEED       = 4.2   // units/sec
const SPRINT_MULT = 1.7
const SENSITIVITY = 0.0018
const HEIGHT      = 1.7   // camera height above floor
const DAMPING     = 12    // movement smoothing

export class Player {
  constructor(camera, domElement) {
    this.camera     = camera
    this.domElement = domElement

    this.velocity   = new THREE.Vector3()
    this.direction  = new THREE.Vector3()
    this.moveInput  = new THREE.Vector3()

    this.yaw   = 0
    this.pitch = 0

    this.locked = false

    this.keys = {
      w: false, a: false, s: false, d: false,
      shift: false
    }

    this._onKeyDown   = this._onKeyDown.bind(this)
    this._onKeyUp     = this._onKeyUp.bind(this)
    this._onMouseMove = this._onMouseMove.bind(this)
    this._onLockChange = this._onLockChange.bind(this)

    document.addEventListener('keydown',  this._onKeyDown)
    document.addEventListener('keyup',    this._onKeyUp)
    document.addEventListener('mousemove', this._onMouseMove)
    document.addEventListener('pointerlockchange', this._onLockChange)

    // Set initial camera position
    this.camera.position.set(0, HEIGHT, 6)
    this.yaw   = Math.PI  // face into the room
    this.pitch = 0
  }

  lock() {
    this.domElement.requestPointerLock()
  }

  unlock() {
    document.exitPointerLock()
  }

  _onLockChange() {
    this.locked = document.pointerLockElement === this.domElement
    document.body.classList.toggle('locked', this.locked)

    const overlay = document.getElementById('overlay')
    if (this.locked) {
      overlay.classList.add('hidden')
    } else {
      overlay.classList.remove('hidden')
    }
  }

  _onKeyDown(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.keys.w = true; break
      case 'KeyS': case 'ArrowDown':  this.keys.s = true; break
      case 'KeyA': case 'ArrowLeft':  this.keys.a = true; break
      case 'KeyD': case 'ArrowRight': this.keys.d = true; break
      case 'ShiftLeft': case 'ShiftRight': this.keys.shift = true; break
      case 'KeyE': this._onInteract(); break
    }
  }

  _onKeyUp(e) {
    switch (e.code) {
      case 'KeyW': case 'ArrowUp':    this.keys.w = false; break
      case 'KeyS': case 'ArrowDown':  this.keys.s = false; break
      case 'KeyA': case 'ArrowLeft':  this.keys.a = false; break
      case 'KeyD': case 'ArrowRight': this.keys.d = false; break
      case 'ShiftLeft': case 'ShiftRight': this.keys.shift = false; break
    }
  }

  _onMouseMove(e) {
    if (!this.locked) return
    this.yaw   -= e.movementX * SENSITIVITY
    this.pitch -= e.movementY * SENSITIVITY
    this.pitch  = Math.max(-Math.PI * 0.44, Math.min(Math.PI * 0.44, this.pitch))
  }

  _onInteract() {
    // Fired by world.js via event listener
    document.dispatchEvent(new CustomEvent('player:interact'))
  }

  update(dt, walls = []) {
    // Apply rotation
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')

    if (!this.locked) return

    // Build movement vector from keys
    const speed = SPEED * (this.keys.shift ? SPRINT_MULT : 1)

    const forward = new THREE.Vector3(
      -Math.sin(this.yaw), 0, -Math.cos(this.yaw)
    )
    const right = new THREE.Vector3(
      Math.cos(this.yaw), 0, -Math.sin(this.yaw)
    )

    this.moveInput.set(0, 0, 0)
    if (this.keys.w) this.moveInput.addScaledVector(forward,  1)
    if (this.keys.s) this.moveInput.addScaledVector(forward, -1)
    if (this.keys.a) this.moveInput.addScaledVector(right,   -1)
    if (this.keys.d) this.moveInput.addScaledVector(right,    1)

    if (this.moveInput.lengthSq() > 0) this.moveInput.normalize()

    // Smooth velocity
    this.velocity.lerp(
      this.moveInput.multiplyScalar(speed),
      1 - Math.exp(-DAMPING * dt)
    )

    // Move
    const next = this.camera.position.clone().addScaledVector(this.velocity, dt)
    next.y = HEIGHT  // keep at floor height (simple, no gravity needed indoors)

    // Simple AABB wall collision
    const RADIUS = 0.35
    let blocked = false
    for (const wall of walls) {
      const b = new THREE.Box3().setFromObject(wall)
      b.expandByScalar(RADIUS)
      if (b.containsPoint(next)) {
        blocked = true
        break
      }
    }

    if (!blocked) {
      this.camera.position.copy(next)
    }
  }

  get position() { return this.camera.position }

  dispose() {
    document.removeEventListener('keydown',  this._onKeyDown)
    document.removeEventListener('keyup',    this._onKeyUp)
    document.removeEventListener('mousemove', this._onMouseMove)
    document.removeEventListener('pointerlockchange', this._onLockChange)
  }
}
