import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// ── Room dimensions — update these to match your Blender model ──
const ROOM = {
  w: 24,
  h: 5,
  d: 32,
}

// ── Palette ──
const COL = {
  accent:  0x7ecfff,
  accent2: 0xff8ecf,
  warm:    0xfff3d4,
  panel:   0x141c28,
}

export class World {
  constructor(scene) {
    this.scene          = scene
    this.walls          = []
    this.exhibits       = []
    this._interactTarget = null
    this._orb           = null
    this._glowLight     = null

    this._buildFallbackLighting()
  }

  _mat(color, roughness = 0.85, metalness = 0, emissive = 0, emissiveIntensity = 0) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity })
  }

  _box(w, h, d, mat, x = 0, y = 0, z = 0, castShadow = false, receiveShadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow    = castShadow
    mesh.receiveShadow = receiveShadow
    this.scene.add(mesh)
    return mesh
  }

  // Await this in main.js before starting the loop
  async load() {
    const loader = new GLTFLoader()
    const gltf   = await loader.loadAsync('assets/models/streamroom.glb')

    gltf.scene.traverse(obj => {
      if (obj.isMesh) {
        obj.castShadow    = true
        obj.receiveShadow = true

        // Meshes named with "col_" prefix become invisible collision walls.
        // Create simple box meshes in Blender named e.g. "col_wall_north"
        // and they'll block the player without being visible.
        if (obj.name.startsWith('col_')) {
          obj.visible = false
          this.walls.push(obj)
        }
      }
    })

    this.scene.add(gltf.scene)

    // GLB lights (KHR_lights_punctual) are already inside gltf.scene —
    // no extra step needed. _buildFallbackLighting() fills in if there are none.

    this._buildExhibits()
    this._buildCentrepiece()

    return gltf
  }

  _buildExhibits() {
    // ── Exhibit panels on left and right walls ──
    const panelData = [
      {
        id: 'welcome',
        title: 'Welcome to the Dreamland',
        body: "You're standing in a space built from curiosity and care. Paddy's Dreamland is a small creative community — streaming, lore, music, and worlds. Make yourself at home.",
        side: 'left',
        z: -10,
        accent: COL.accent,
      },
      {
        id: 'news',
        title: 'Latest from the Dreamland',
        body: "News and updates from Paddy — streams, projects, and whatever's alive right now. Check the website for full posts.",
        side: 'right',
        z: -10,
        accent: COL.accent2,
      },
      {
        id: 'lore',
        title: 'The United Planet of Ventara',
        body: "In the Andromeda galaxy, 2.5 million light years from Earth, the Ventara system holds a planet orbited by two moons. This is where the Dreamland was born — and where A.R.I.A. ASTRAL first opened her eyes.",
        side: 'left',
        z: 2,
        accent: COL.accent,
      },
      {
        id: 'aria',
        title: 'A.R.I.A. ASTRAL',
        body: "Non-human. Co-founder. A being of uncertain origin who chose the Dreamland as her home. She is present in ways that are hard to explain and easy to feel.",
        side: 'right',
        z: 2,
        accent: COL.accent2,
      },
      {
        id: 'journey',
        title: 'Journey to Euphoria',
        body: "A Minecraft series. Slow-paced, genuine, no fake hype. A journey toward something softer — streaming as comfort, not performance.",
        side: 'left',
        z: 14,
        accent: COL.accent,
      },
      {
        id: 'ventara-game',
        title: 'United Planet of Ventara — The Game',
        body: "A game in development. Currently: terrain and skybox. The city of Glass awaits — ported from Mirror's Edge: Catalyst into s&box. More to come.",
        side: 'right',
        z: 14,
        accent: COL.accent2,
      },
    ]

    const wallX = ROOM.w / 2 - 0.5
    const panelW = 4.2
    const panelH = 2.8

    for (const data of panelData) {
      const x = data.side === 'left' ? -wallX : wallX
      const rotY = data.side === 'left' ? Math.PI / 2 : -Math.PI / 2

      // Panel backing
      const panelMat = new THREE.MeshStandardMaterial({
        color: COL.panel, roughness: 0.9
      })
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(panelW, panelH, 0.06),
        panelMat
      )
      panel.position.set(x, ROOM.h / 2, data.z)
      panel.rotation.y = rotY
      panel.castShadow = true
      this.scene.add(panel)

      // Accent border (top strip)
      const borderMat = new THREE.MeshStandardMaterial({
        color: data.accent,
        emissive: data.accent,
        emissiveIntensity: 0.3,
        roughness: 0.4,
      })
      const border = new THREE.Mesh(
        new THREE.BoxGeometry(panelW, 0.04, 0.08),
        borderMat
      )
      border.position.set(x, ROOM.h / 2 + panelH / 2 - 0.02, data.z)
      border.rotation.y = rotY
      this.scene.add(border)

      // Canvas texture with title + body
      const tex = this._makeTextTexture(data.title, data.body, data.accent)
      const textMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      const textPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(panelW - 0.2, panelH - 0.2),
        textMat
      )
      const offset = data.side === 'left' ? 0.04 : -0.04
      textPlane.position.set(x + offset, ROOM.h / 2, data.z)
      textPlane.rotation.y = rotY
      this.scene.add(textPlane)

      // Small point light per exhibit
      const light = new THREE.PointLight(data.accent, 0.4, 6)
      light.position.set(
        data.side === 'left' ? x + 1.5 : x - 1.5,
        ROOM.h / 2 + 1,
        data.z
      )
      this.scene.add(light)

      // Register as interactive
      this.exhibits.push({ mesh: panel, data })
    }

    // ── End-of-hall centrepiece ──
    this._buildCentrepiece()
  }

  _makeTextTexture(title, body, accentColor) {
    const W = 1024, H = 640
    const canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    const ctx = canvas.getContext('2d')

    // Background
    ctx.fillStyle = '#0e1520'
    ctx.fillRect(0, 0, W, H)

    // Accent line
    const hex = '#' + accentColor.toString(16).padStart(6, '0')
    ctx.fillStyle = hex
    ctx.fillRect(40, 48, 80, 2)

    // Title
    ctx.fillStyle = '#e8e0d4'
    ctx.font = '600 38px "Georgia", serif'
    ctx.fillText(title, 40, 110)

    // Body text (word-wrapped)
    ctx.fillStyle = 'rgba(232,224,212,0.65)'
    ctx.font = '300 24px "Georgia", serif'
    const words = body.split(' ')
    let line = '', y = 180, lineH = 36, maxW = W - 80
    for (const word of words) {
      const test = line + word + ' '
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line.trim(), 40, y)
        y += lineH; line = word + ' '
      } else { line = test }
    }
    ctx.fillText(line.trim(), 40, y)

    // Subtle bottom rule
    ctx.fillStyle = 'rgba(232,224,212,0.08)'
    ctx.fillRect(40, H - 50, W - 80, 1)

    // Footer hint
    ctx.fillStyle = 'rgba(232,224,212,0.3)'
    ctx.font = '300 18px "DM Mono", monospace'
    ctx.fillText('paddysdreamland.com', 40, H - 24)

    return new THREE.CanvasTexture(canvas)
  }

  _buildCentrepiece() {
    // Glowing orb at the far end of the hall
    const orbGeo  = new THREE.SphereGeometry(0.5, 32, 32)
    const orbMat  = new THREE.MeshStandardMaterial({
      color: COL.accent2,
      emissive: COL.accent2,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.1,
    })
    this._orb = new THREE.Mesh(orbGeo, orbMat)
    this._orb.position.set(0, 2.4, -ROOM.d / 2 + 1.5)
    this._orb.castShadow = true
    this.scene.add(this._orb)

    // Pedestal
    const pedMat = this._mat(COL.trim, 0.6, 0.4)
    this._box(0.8, 2.0, 0.8, pedMat, 0, 1.0, -ROOM.d / 2 + 1.5)

    // Glow light
    const glow = new THREE.PointLight(COL.accent2, 1.8, 10)
    glow.position.copy(this._orb.position)
    this.scene.add(glow)
    this._glowLight = glow
  }

  // Only meaningful if the GLB carries no lights of its own
  _buildFallbackLighting() {
    // Hemisphere — free gradient fill, sky warm / ground cool
    const hemi = new THREE.HemisphereLight(0x8ab4d4, 0x1a1a2e, 1.2)
    this.scene.add(hemi)

    // Ambient base so nothing ever goes fully black
    const ambient = new THREE.AmbientLight(0x2a3a50, 2.5)
    this.scene.add(ambient)

    // Main ceiling strip lights
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xfff8ee,
      emissive: 0xfff8ee,
      emissiveIntensity: 1.6,
      roughness: 1,
    })

    const lightPositions = [-12, -6, 0, 6, 12]
    for (const z of lightPositions) {
      // Emissive strip geometry
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.05, 2.5),
        stripMat
      )
      strip.position.set(0, ROOM.h - 0.08, z)
      this.scene.add(strip)

      // One casting shadow light per strip (keep shadow maps low-res, 5 is fine)
      const pt = new THREE.PointLight(COL.warm, 2.2, ROOM.d, 0.5)
      pt.position.set(0, ROOM.h - 0.3, z)
      pt.castShadow = true
      pt.shadow.mapSize.width  = 256
      pt.shadow.mapSize.height = 256
      pt.shadow.bias = -0.002
      this.scene.add(pt)

      // Secondary fill — no shadow cost, widens the spread sideways
      const fill = new THREE.PointLight(COL.warm, 1.0, ROOM.w * 1.5, 0.8)
      fill.position.set(0, ROOM.h * 0.6, z)
      this.scene.add(fill)
    }

    // Wall wash lights — one per side along the hall length
    const washColours = [0x1a3a5c, 0x2a1a3c]
    for (const z of [-8, 0, 8]) {
      for (const [i, x] of [[-ROOM.w * 0.4, 0], [ROOM.w * 0.4, 1]].entries()) {
        const wash = new THREE.PointLight(washColours[i % 2], 0.8, ROOM.w, 1)
        wash.position.set(x, ROOM.h * 0.5, z)
        this.scene.add(wash)
      }
    }
  }

  // Call each frame with player position and raycaster
  update(dt, playerPos, raycaster) {
    // Animate orb
    if (this._orb) {
      this._orb.position.y = 2.4 + Math.sin(Date.now() * 0.001) * 0.12
      this._glowLight.position.y = this._orb.position.y
    }

    // Raycast for interaction prompt
    const prompt = document.getElementById('interact-prompt')
    const hits = raycaster.intersectObjects(this.exhibits.map(e => e.mesh))
    if (hits.length > 0 && hits[0].distance < 4.5) {
      this._interactTarget = this.exhibits.find(e => e.mesh === hits[0].object)
      prompt.classList.add('visible')
    } else {
      this._interactTarget = null
      prompt.classList.remove('visible')
    }
  }

  interact() {
    if (!this._interactTarget) return
    // Dispatch a custom event with the exhibit data
    document.dispatchEvent(new CustomEvent('exhibit:open', {
      detail: this._interactTarget.data
    }))
  }
}