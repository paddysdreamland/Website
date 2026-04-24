import * as THREE from 'three'

// ── Palette (matching CSS vars roughly) ──
const COL = {
  bg:       0x080b10,
  floor:    0x0e1218,
  wall:     0x111620,
  ceiling:  0x0a0e14,
  trim:     0x1e2836,
  accent:   0x7ecfff,
  accent2:  0xff8ecf,
  warm:     0xfff3d4,
  panel:    0x141c28,
  panelBdr: 0x2a3f5a,
}

const ROOM = {
  w: 24,    // width  (x)
  h: 5,     // height (y)
  d: 32,    // depth  (z) — the main hall
}

export class World {
  constructor(scene) {
    this.scene    = scene
    this.walls    = []      // collision objects
    this.exhibits = []      // interactive objects { mesh, data }
    this._interactTarget = null

    this._build()
    this._buildExhibits()
    this._buildLighting()
  }

  _mat(color, roughness = 0.85, metalness = 0, emissive = 0, emissiveIntensity = 0) {
    return new THREE.MeshStandardMaterial({
      color, roughness, metalness,
      emissive, emissiveIntensity,
    })
  }

  _box(w, h, d, mat, x = 0, y = 0, z = 0, castShadow = false, receiveShadow = true) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    mesh.position.set(x, y, z)
    mesh.castShadow    = castShadow
    mesh.receiveShadow = receiveShadow
    this.scene.add(mesh)
    return mesh
  }

  _buildRoom(ox, oy, oz, rw, rh, rd) {
    const floorMat   = this._mat(COL.floor,   0.9, 0)
    const wallMat    = this._mat(COL.wall,     0.9, 0)
    const ceilMat    = this._mat(COL.ceiling,  0.95, 0)
    const trimMat    = this._mat(COL.trim,     0.7, 0.2)

    // Floor
    this._box(rw, 0.1, rd, floorMat, ox, oy,       oz)
    // Ceiling
    this._box(rw, 0.1, rd, ceilMat,  ox, oy + rh,  oz)

    // Walls (added to collision list)
    const wallThick = 0.4
    const walls = [
      // back
      this._box(rw + wallThick*2, rh, wallThick, wallMat, ox, oy + rh/2, oz - rd/2 - wallThick/2),
      // front
      this._box(rw + wallThick*2, rh, wallThick, wallMat, ox, oy + rh/2, oz + rd/2 + wallThick/2),
      // left
      this._box(wallThick, rh, rd, wallMat, ox - rw/2 - wallThick/2, oy + rh/2, oz),
      // right
      this._box(wallThick, rh, rd, wallMat, ox + rw/2 + wallThick/2, oy + rh/2, oz),
    ]
    walls.forEach(w => this.walls.push(w))

    // Skirting trim
    const skirtH = 0.12
    const skirtD = 0.06
    ;[
      [rw, skirtH, skirtD, ox, oy + skirtH/2, oz - rd/2 + skirtD/2],
      [rw, skirtH, skirtD, ox, oy + skirtH/2, oz + rd/2 - skirtD/2],
      [skirtD, skirtH, rd, ox - rw/2 + skirtD/2, oy + skirtH/2, oz],
      [skirtD, skirtH, rd, ox + rw/2 - skirtD/2, oy + skirtH/2, oz],
    ].forEach(([w,h,d,x,y,z]) => this._box(w,h,d, trimMat, x,y,z))

    // Cornice trim (top)
    ;[
      [rw, skirtH, skirtD, ox, oy + rh - skirtH/2, oz - rd/2 + skirtD/2],
      [rw, skirtH, skirtD, ox, oy + rh - skirtH/2, oz + rd/2 - skirtD/2],
      [skirtD, skirtH, rd, ox - rw/2 + skirtD/2, oy + rh - skirtH/2, oz],
      [skirtD, skirtH, rd, ox + rw/2 - skirtD/2, oy + rh - skirtH/2, oz],
    ].forEach(([w,h,d,x,y,z]) => this._box(w,h,d, trimMat, x,y,z))
  }

  _build() {
    // Main hall
    this._buildRoom(0, 0, 0, ROOM.w, ROOM.h, ROOM.d)

    // Floor tiles (decorative grid lines via thin boxes)
    const tileMat = this._mat(COL.trim, 1, 0)
    const tileSize = 3
    for (let x = -ROOM.w/2; x <= ROOM.w/2; x += tileSize) {
      this._box(0.02, 0.001, ROOM.d, tileMat, x, 0.06, 0)
    }
    for (let z = -ROOM.d/2; z <= ROOM.d/2; z += tileSize) {
      this._box(ROOM.w, 0.001, 0.02, tileMat, 0, 0.06, z)
    }

    // Central runner carpet
    const carpetMat = this._mat(0x1a1028, 0.95, 0)
    this._box(2.5, 0.02, ROOM.d - 2, carpetMat, 0, 0.06, 0)

    // Columns (4 pairs along the hall)
    const colMat = this._mat(COL.trim, 0.6, 0.3)
    const colPositions = [-10, -4, 4, 10]
    for (const z of colPositions) {
      for (const x of [-ROOM.w/2 + 1.5, ROOM.w/2 - 1.5]) {
        const col = this._box(0.5, ROOM.h, 0.5, colMat, x, ROOM.h/2, z, true)
        this.walls.push(col)

        // Column cap
        this._box(0.7, 0.12, 0.7, this._mat(COL.trim, 0.5, 0.4), x, ROOM.h - 0.06, z)
        // Column base
        this._box(0.7, 0.12, 0.7, this._mat(COL.trim, 0.5, 0.4), x, 0.06, z)
      }
    }

    // Archway frames (decorative, above column pairs)
    const archMat = this._mat(COL.trim, 0.5, 0.3)
    for (const z of colPositions) {
      this._box(ROOM.w - 3, 0.12, 0.12, archMat, 0, ROOM.h - 0.4, z)
    }
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

  _buildLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x1a2535, 0.8)
    this.scene.add(ambient)

    // Main ceiling strip lights (rectangles of emissive geometry)
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xfff8ee,
      emissive: 0xfff8ee,
      emissiveIntensity: 1.2,
      roughness: 1,
    })
    const lightPositions = [-12, -6, 0, 6, 12]
    for (const z of lightPositions) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.05, 2.5),
        stripMat
      )
      strip.position.set(0, ROOM.h - 0.08, z)
      this.scene.add(strip)

      const pt = new THREE.PointLight(COL.warm, 0.9, 12, 1.5)
      pt.position.set(0, ROOM.h - 0.3, z)
      pt.castShadow = true
      pt.shadow.mapSize.width  = 512
      pt.shadow.mapSize.height = 512
      this.scene.add(pt)
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
