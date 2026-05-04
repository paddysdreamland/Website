import * as THREE from 'three'
import { Player }    from './player.js'
import { World }     from './world.js'
import { ExhibitUI } from './ui.js'

// ── Scene setup ──
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type    = THREE.PCFSoftShadowMap
renderer.toneMapping       = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.4
renderer.outputColorSpace  = THREE.SRGBColorSpace

const container = document.getElementById('canvas-container')
container.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x080b10)
scene.fog        = new THREE.Fog(0x080b10, 18, 36)

// ── Cameras ──
const fpsCamera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 100)
scene.add(fpsCamera)

const tpCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 100)
scene.add(tpCamera)

let debugMode = false
let activeCamera = fpsCamera

// ── Debug: player box visualiser ──
const playerBox = new THREE.Mesh(
  new THREE.BoxGeometry(0.7, 1.7, 0.7),  // HALF_W*2 x HALF_H*2 x HALF_W*2
  new THREE.MeshBasicMaterial({ color: 0x00ff88, wireframe: true })
)
playerBox.visible = false
scene.add(playerBox)

// ── Debug label ──
const debugLabel = document.createElement('div')
debugLabel.style.cssText = `
  position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%);
  font-family: 'DM Mono', monospace; font-size: 10px; letter-spacing: 0.2em;
  text-transform: uppercase; color: rgba(0,255,136,0.7);
  pointer-events: none; opacity: 0; transition: opacity 0.3s;
`
debugLabel.textContent = 'Debug — Third Person'
document.body.appendChild(debugLabel)

function setDebugMode(enabled) {
  debugMode       = enabled
  activeCamera    = enabled ? tpCamera : fpsCamera
  playerBox.visible = enabled
  debugLabel.style.opacity = enabled ? '1' : '0'
  document.getElementById('crosshair').style.opacity = enabled ? '0' : ''
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyT') setDebugMode(!debugMode)
})

// ── Subsystems ──
const world     = new World(scene)
const player    = new Player(fpsCamera, renderer.domElement)
const exhibitUI = new ExhibitUI()
const raycaster = new THREE.Raycaster()

// ── Pointer lock flow ──
const enterBtn = document.getElementById('enter-btn')
enterBtn.addEventListener('click', () => player.lock())

// ── Interaction bridge ──
document.addEventListener('player:interact', () => {
  if (!exhibitUI._el.classList.contains('open')) {
    world.interact()
  }
})

// ── Resize ──
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight
  fpsCamera.aspect = aspect
  fpsCamera.updateProjectionMatrix()
  tpCamera.aspect = aspect
  tpCamera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ── Load world then start loop ──
enterBtn.disabled = true
enterBtn.textContent = 'Loading...'

await world.load()

enterBtn.disabled = false
enterBtn.textContent = 'Enter'

// ── Third person camera offset ──
const TP_OFFSET = new THREE.Vector3(0, 2, 5)  // behind and above

function updateTPCamera() {
  const pos = fpsCamera.position.clone()
  const yaw = player.yaw

  // Rotate offset by player yaw so camera stays behind them
  const offset = TP_OFFSET.clone()
  offset.applyEuler(new THREE.Euler(0, yaw, 0))

  tpCamera.position.copy(pos).add(offset)
  tpCamera.lookAt(pos)
}

// ── Game loop ──
let prev = performance.now()

function loop() {
  requestAnimationFrame(loop)

  const now = performance.now()
  const dt  = Math.min((now - prev) / 1000, 0.05)
  prev = now

  player.update(dt, world.walls)

  // Sync debug box to player position
  if (debugMode) {
    playerBox.position.copy(fpsCamera.position)
    playerBox.position.y = 0.85  // HALF_H — center box so bottom sits on floor
    updateTPCamera()
  }

  raycaster.setFromCamera(new THREE.Vector2(0, 0), activeCamera)
  world.update(dt, fpsCamera.position, raycaster)

  renderer.render(scene, activeCamera)
}

loop()
