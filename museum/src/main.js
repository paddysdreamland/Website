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

const scene  = new THREE.Scene()
scene.background = new THREE.Color(0x080b10)
scene.fog        = new THREE.Fog(0x080b10, 18, 36)

const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 100)
scene.add(camera)

// ── Subsystems ──
const world     = new World(scene)
const player    = new Player(camera, renderer.domElement)
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
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

// ── Load world then start loop ──
enterBtn.disabled = true
enterBtn.textContent = 'Loading...'

await world.load()

enterBtn.disabled = false
enterBtn.textContent = 'Enter'

// ── Game loop ──
let prev = performance.now()

function loop() {
  requestAnimationFrame(loop)

  const now = performance.now()
  const dt  = Math.min((now - prev) / 1000, 0.05)  // cap at 50ms
  prev = now

  // Update raycaster from camera centre
  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera)

  player.update(dt, world.walls)
  world.update(dt, player.position, raycaster)

  renderer.render(scene, camera)
}

loop()
