import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export const MAP_MODEL = "models/glg/glass.glb";
export const SKY_TEXTURE = "images/sky/DefaultGradientObjPreview.png";
export const POINTER_TEXTURE = "ui/texturemappings/map_pointer.png";

/* The model is normalised so its longest dimension is 1 unit, which makes
   every distance below a fraction of the city rather than a raw model unit.
   Opening on the whole city gives the answer away, so the camera starts close
   in on the model's own pivot instead. */
const START_DISTANCE = 0.055;
const START_PITCH_DEG = 45;

/* Pointer height in CSS pixels, held constant at every zoom. The source image
   is 32x32 and tapers to a 2px tip at both ends, so POINTER_ASPECT is 1.

   Anchoring follows three.js's Sprite.center convention, where y = 0 is the
   BOTTOM edge of the image - the opposite of the CSS/Unity convention where
   (0.5, 1) means bottom-centre. (0.5, 0) is the equivalent here: the sprite
   stands above its position with the lower tip on the guessed point. Flip to
   1 to hang it below instead. */
const POINTER_SIZE_PX = 64;
const POINTER_ASPECT = 1;
const POINTER_ANCHOR = [0.5, 0.25];

const GUESS_COLOR = 0xff2828;
const ANSWER_COLOR = 0x28e0ff;
const DEBUG_COLOR = 0x39ff6a;

/* The environment is captured from the scene itself once the city is loaded,
   so reflective surfaces show actual towers rather than a flat gradient.
   ENV_HEIGHT lifts the capture point off the pivot, which may sit at ground
   level or inside geometry. Both are fractions of the normalised city. */
const ENV_RESOLUTION = 256;
const ENV_HEIGHT = 0.06;

/* Size of the pannable area as a multiple of the model's bounding box. That
   box is dominated by the distant vista backdrop rather than by Glass itself,
   so 1 is far looser than it sounds, and values below it are what actually
   confine panning to the playable city. */
const PAN_BOUNDS_SCALE = 0.5;

/* The sky gradient spikes to its brightest in a narrow band right at the
   horizon (#7faecc at v=0.496) and falls away by roughly a quarter within
   eight pixels either side. Averaging across that band - which is what the
   previous value did - lands too dark, and geometry reads as dirty against
   the sky. This is the peak itself, the row that distant geometry and the
   water's edge actually sit against.

   A single colour can only ever match one elevation of a gradient sky, and
   the higher FOG_DENSITY is the more completely geometry saturates to it, so
   the two want tuning together. Density is in normalised city widths - the
   whole model spans 1 unit. */
const FOG_COLOR = 0x7faecc;
const FOG_DENSITY = 4;

/* water_mat stops at roughly 92% x 80% of the model footprint. Rather than
   leaning on fog to hide that edge, a plain quad of the same material is laid
   under it, out to OCEAN_EXTEND_SCALE times the model's span, so the sea runs
   past anything the camera can reach. The original mesh is left untouched;
   the quad sits OCEAN_EXTEND_DROP below it, because two coplanar surfaces
   z-fight regardless of the depth buffer. */
const OCEAN_EXTEND_SCALE = 8;
const OCEAN_EXTEND_DROP = 0.0005;

const WATER_COLOR = 0x0d2a3a;
const GROUND_COLOR = 0xe4e9ec;
const GLASS_COLOR = 0xdce8ef;

/* glass.glb is authored Z-up and is not centred on its origin. The root group
   carries the -90deg X rotation so three.js sees Y-up, and the model object
   carries the recentering offset. Every coordinate this module hands out or
   takes in is in ORIGINAL model space (Z-up, uncentred) so that location data
   measured in Blender drops straight in without conversion. */
const MODEL_IS_Z_UP = true;

/* Frostbite is Y-up and works in metres; this export is Z-up and was scaled to
   1/100 on the way out, so one model unit is 100 m. The axis change is a +90
   degree rotation about X, (x, y, z) -> (x, -z, y). Verified against
   (1017.928711, 116.246872, -147.650406) -> (10.179287, 1.476504, 1.162468). */
export const METRES_PER_UNIT = 100;

export function fromFrostbite(x, y, z) {
    const p = (x && typeof x === "object") ? x : { x: x, y: y, z: z };
    return {
        x: p.x / METRES_PER_UNIT,
        y: -p.z / METRES_PER_UNIT,
        z: p.y / METRES_PER_UNIT
    };
}

export function toFrostbite(x, y, z) {
    const p = (x && typeof x === "object") ? x : { x: x, y: y, z: z };
    return {
        x: p.x * METRES_PER_UNIT,
        y: p.z * METRES_PER_UNIT,
        z: -p.y * METRES_PER_UNIT
    };
}

/* Ground distance in METRES between two model-space points. Height is ignored
   deliberately: Glass is vertical enough that counting it would punish a
   correct guess made on the wrong rooftop. */
export function horizontalDistance(a, b) {
    const dx = a.x - b.x;
    const dy = MODEL_IS_Z_UP ? a.y - b.y : a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy) * METRES_PER_UNIT;
}

function makePointer(texture, color) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        color: color,
        transparent: true,
        depthTest: false,
        /* Off, so the sprite does not shrink with distance - see
           pointerScale() for how that turns into an exact pixel height. */
        sizeAttenuation: false
    }));

    sprite.center.set(POINTER_ANCHOR[0], POINTER_ANCHOR[1]);
    sprite.renderOrder = 999;
    sprite.visible = false;
    return sprite;
}

/* The export is 48 KHR_materials_unlit materials whose textures already carry
   the baked lighting, plus three untextured PBR ones (the "glass" material on
   11 primitives, and two props). glTF defaults metallicFactor to 1.0, and a
   fully metallic surface with no environment map in the scene resolves to
   black - which is why those few objects read as dark slabs rather than as
   unlit geometry. GLTFLoader materialises KHR_materials_unlit as
   MeshBasicMaterial, so the ones that actually want lighting are exactly the
   MeshStandardMaterials. Lights cannot touch the baked city, so their
   intensity is free to be tuned purely for these. */
function normalizeMaterials(model) {
    const done = new Set();
    const touched = [];

    model.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];

        for (let i = 0; i < mats.length; i++) {
            const mat = mats[i];
            if (!mat.isMeshStandardMaterial) continue;

            /* The three non-unlit materials are named 材质.048 / .049 / glass,
               so the useful identity is on the mesh instead: water_mat,
               map_mat, and the various *_glass_mat landmarks. */
            if (/water/i.test(o.name)) {
                const water = new THREE.MeshPhysicalMaterial({
                    color: WATER_COLOR,
                    /* Dielectric rather than metal: at ior 1.333 three.js
                       derives water's real F0, so the surface is dark looking
                       straight down and turns mirror-like towards the horizon.
                       Metalness would reflect evenly at every angle and read as
                       polished floor rather than sea. */
                    metalness: 0,
                    roughness: 0.04,
                    ior: 1.333,
                    envMapIntensity: 1.4
                });
                if (Array.isArray(o.material)) o.material[i] = water; else o.material = water;
                mat.dispose();
                touched.push(o.name + " -> water");
                continue;
            }

            if (done.has(mat)) continue;
            done.add(mat);

            if (/map_mat/i.test(o.name)) {
                /* Terrain the baked city sits on. Any metalness here catches
                   the sun as a sheen across the whole landmass. */
                mat.metalness = 0;
                mat.roughness = 0.95;
                mat.color.setHex(GROUND_COLOR);
            } else if (mat.name === "glass") {
                mat.metalness = 0.9;
                mat.roughness = 0.08;
                mat.color.setHex(GLASS_COLOR);
            } else {
                mat.metalness = 0.25;
                mat.roughness = 0.6;
                mat.color.setHex(GROUND_COLOR);
            }

            mat.envMapIntensity = 1.0;
            mat.needsUpdate = true;
            touched.push(o.name + " -> " + (mat.name || "unnamed"));
        }
    });

    return touched;
}

export function createMap(mount) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    /* A 2:1 equirectangular gradient. EquirectangularReflectionMapping projects
       it onto a sphere at infinity, so it needs no geometry of its own and
       never clips against the camera far plane. Assigning it to .environment as
       well gives the three non-baked PBR materials something to reflect, which
       is the piece they were missing - the baked city ignores it entirely. */
    const sky = new THREE.TextureLoader().load(SKY_TEXTURE);
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky;

    /* The water plane stops at roughly 92% x 80% of the model footprint, so the
       sea genuinely ends rather than being clipped. Exponential fog buries that
       edge instead of moving it. MeshBasicMaterial respects fog, so the baked
       city fades along with everything else. */
    scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);
    /* Deliberately not scene.environment - a 256x128 gradient has no detail to
       reflect, so it reads as a flat tint. captureEnvironment() replaces it
       with the city once that has loaded. */

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / mount.clientHeight, 0.0002, 50);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9fb3bf, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(0.6, 1, 0.4);
    scene.add(sun);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = false;
    controls.maxPolarAngle = THREE.MathUtils.degToRad(80);
    controls.minDistance = 0.002;
    controls.maxDistance = 2.5;

    /* Map conventions rather than model-viewer conventions: left drag slides
       the city, right drag orbits. screenSpacePanning is left off so panning
       tracks the ground plane instead of the camera plane - drag a rooftop and
       it stays under the cursor rather than sliding upward as you tilt. */
    controls.touches = {
        ONE: THREE.TOUCH.PAN,
        TWO: THREE.TOUCH.DOLLY_ROTATE
    };
    controls.listenToKeyEvents(window);

    /* Orbit is on ctrl/meta/shift + left, never on the right button. Browsers
       with mouse
       gestures (Vivaldi, Opera) withhold right-button events during the drag
       and replay them on release, so OrbitControls can receive a pointerdown
       whose pointerup never arrives. Its onPointerDown calls setPointerCapture
       and _addPointer before it ever looks at the button mapping, so a stranded
       pointer stays in _pointers permanently - and the next left drag then sees
       _pointers.length === 2 and is handled as a two-finger touch gesture.
       That is the unpredictable lock-up, and why it takes an arbitrary number
       of further right clicks to balance the books. Unmapping the button is
       not enough because the capture happens first; the event has to be stopped
       before OrbitControls sees it at all. See rejectRightButton below. */
    controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };

    /* No modifier handling needed here: with LEFT bound to PAN, OrbitControls
       already inverts to ROTATE while ctrl, meta or shift is held. */

    /* Capture phase on the container, which is an ancestor of the canvas
       OrbitControls binds to, so this runs first and stopPropagation keeps the
       right button from reaching it at all. */
    const rejectRightButton = (e) => {
        if (e.button === 2 || e.buttons === 2) e.stopPropagation();
    };
    mount.addEventListener("pointerdown", rejectRightButton, true);
    mount.addEventListener("pointerup", rejectRightButton, true);

    /* OrbitControls suppresses the context menu on the canvas but not on the
       container around it. */
    const onContextMenu = (e) => e.preventDefault();
    mount.addEventListener("contextmenu", onContextMenu);

    const root = new THREE.Group();
    if (MODEL_IS_Z_UP) root.rotation.x = -Math.PI / 2;
    scene.add(root);

    const pointerTexture = new THREE.TextureLoader().load(POINTER_TEXTURE);
    pointerTexture.colorSpace = THREE.SRGBColorSpace;
    /* The sprite is drawn at a fixed pixel size, so mip levels would only ever
       blur it. The image is pure white, which lets colour do the tinting. */
    pointerTexture.generateMipmaps = false;
    pointerTexture.minFilter = THREE.LinearFilter;

    const guessMarker = makePointer(pointerTexture, GUESS_COLOR);
    const answerMarker = makePointer(pointerTexture, ANSWER_COLOR);
    scene.add(guessMarker, answerMarker);

    let model = null;
    let modelScale = 1;
    let panBounds = null;
    let environment = null;
    let oceanQuad = null;
    const debugMarkers = [];
    let pickCallback = null;

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downAt = null;

    /* OrbitControls drags and guess clicks share the left button, so only treat
       a release as a guess if the pointer barely moved since it went down. */
    renderer.domElement.addEventListener("pointerdown", (e) => {
        downAt = { x: e.clientX, y: e.clientY, button: e.button };
        renderer.domElement.style.cursor = "grabbing";
    });

    /* On window rather than the canvas, so releasing the button off-canvas
       still restores the cursor. The pick handler below bails out early in
       several cases, so it cannot own this. */
    const onPointerUp = () => { renderer.domElement.style.cursor = "crosshair"; };
    window.addEventListener("pointerup", onPointerUp);

    renderer.domElement.addEventListener("pointerup", (e) => {
        if (!downAt || !model || !pickCallback) return;
        const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
        const button = downAt.button;
        downAt = null;
        /* Without the button check a stationary right-click - the exact thing
           an interrupted orbit produces - would register as a guess. */
        if (button !== 0 || moved > 5) return;

        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(model, true)[0];
        if (!hit) return;

        guessMarker.position.copy(hit.point);
        guessMarker.visible = true;
        pickCallback(model.worldToLocal(hit.point.clone()));
    });

    function onResize() {
        const w = mount.clientWidth;
        const h = mount.clientHeight;
        if (!w || !h) return;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
    }
    const resizeObserver = new ResizeObserver(onResize);
    resizeObserver.observe(mount);

    let running = true;
    /* Panning is unbounded by default, and on a city this large it is very
       easy to slide off into empty space with nothing on screen to navigate
       back by. Shifting the camera by the same amount as the clamped target
       keeps the view angle untouched while the pan simply stops. */
    function clampPan() {
        if (!panBounds) return;
        const t = controls.target;
        const x = THREE.MathUtils.clamp(t.x, panBounds.min.x, panBounds.max.x);
        const z = THREE.MathUtils.clamp(t.z, panBounds.min.z, panBounds.max.z);
        if (x === t.x && z === t.z) return;

        camera.position.x += x - t.x;
        camera.position.z += z - t.z;
        t.x = x;
        t.z = z;
    }

    /* With sizeAttenuation off, the sprite shader multiplies scale by the view
       depth, so the perspective divide cancels and scale lands directly in NDC
       as scale * (1 / tan(fov/2)). NDC height 2 spans the viewport, which
       inverts to the pixel height wanted here. Recomputed per frame so resizes
       need no extra bookkeeping. */
    function pointerScale() {
        const h = mount.clientHeight || 1;
        return 2 * POINTER_SIZE_PX * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / h;
    }

    function scaleMarker(marker) {
        if (!marker.visible) return;
        const s = pointerScale();
        marker.scale.set(s * POINTER_ASPECT, s, 1);
    }

    function tick() {
        if (!running) return;
        controls.update();
        clampPan();
        scaleMarker(guessMarker);
        scaleMarker(answerMarker);
        for (const marker of debugMarkers) scaleMarker(marker);
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    /* Places the camera at START_PITCH_DEG above the horizontal, looking down
       at target from the given distance. */
    function frameOn(target, distance) {
        const pitch = THREE.MathUtils.degToRad(START_PITCH_DEG);
        controls.target.copy(target);
        camera.position.copy(target).add(
            new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(distance)
        );
        controls.update();
    }

    /* Renders the loaded scene into a cubemap once, then prefilters it so that
       roughness maps to the right blur level. A single capture point means the
       reflection is only strictly correct at that point, which is invisible on
       a stylised city and costs one render instead of one per frame. */
    /* water_mat is not a flat plane - 70% of its vertices sit on the surface
       proper and the rest form the edge skirt that drops away below it, plus a
       lip that rises above. Its bounding box top is therefore well clear of the
       actual waterline, so the modal height is what the quad has to match. */
    function waterSurfaceY(water) {
        const pos = water.geometry.attributes.position;
        const v = new THREE.Vector3();

        let lo = Infinity;
        let hi = -Infinity;
        for (let i = 0; i < pos.count; i++) {
            const y = water.localToWorld(v.fromBufferAttribute(pos, i)).y;
            if (y < lo) lo = y;
            if (y > hi) hi = y;
        }
        if (!(hi > lo)) return lo;

        /* Bucketed rather than compared exactly, so float drift through the
           transform cannot split one plane across several near-identical keys. */
        const BUCKETS = 512;
        const counts = new Int32Array(BUCKETS);
        const sums = new Float64Array(BUCKETS);
        for (let i = 0; i < pos.count; i++) {
            const y = water.localToWorld(v.fromBufferAttribute(pos, i)).y;
            const b = Math.min(BUCKETS - 1, Math.floor(((y - lo) / (hi - lo)) * BUCKETS));
            counts[b]++;
            sums[b] += y;
        }

        let best = 0;
        for (let b = 1; b < BUCKETS; b++) if (counts[b] > counts[best]) best = b;
        return sums[best] / counts[best];
    }

    /* Returns the added quad so it can be disposed with everything else. It is
       parented to the scene rather than to the model, which also keeps it out
       of the guess raycast - that tests against the model only. */
    function extendOcean() {
        let water = null;
        model.traverse((o) => {
            if (o.isMesh && /water/i.test(o.name)) water = o;
        });
        if (!water) return null;

        const surfaceY = waterSurfaceY(water);
        const modelBox = new THREE.Box3().setFromObject(root);
        const centre = modelBox.getCenter(new THREE.Vector3());
        const size = modelBox.getSize(new THREE.Vector3());
        const span = Math.max(size.x, size.z) * OCEAN_EXTEND_SCALE;

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(span, span), water.material);
        quad.rotation.x = -Math.PI / 2;
        quad.position.set(centre.x, surfaceY - OCEAN_EXTEND_DROP, centre.z);
        scene.add(quad);
        return quad;
    }

    function captureEnvironment(origin) {
        /* Capture without fog. Baking it into the environment would mute every
           reflection by the average fog colour, which mostly undoes the water. */
        const fog = scene.fog;
        scene.fog = null;

        const cubeTarget = new THREE.WebGLCubeRenderTarget(ENV_RESOLUTION, { type: THREE.HalfFloatType });
        const cubeCamera = new THREE.CubeCamera(camera.near, camera.far, cubeTarget);
        cubeCamera.position.copy(origin).setY(origin.y + ENV_HEIGHT);
        cubeCamera.updateMatrixWorld(true);
        cubeCamera.update(renderer, scene);

        const pmrem = new THREE.PMREMGenerator(renderer);
        const prefiltered = pmrem.fromCubemap(cubeTarget.texture);

        if (environment) environment.dispose();
        environment = prefiltered.texture;
        scene.environment = environment;

        pmrem.dispose();
        cubeTarget.dispose();
        scene.fog = fog;
    }

    function toWorld(modelPos) {
        return model.localToWorld(new THREE.Vector3(modelPos.x, modelPos.y, modelPos.z));
    }

    return {
        /* Resolves once the city is on screen. onProgress gets 0..1, or null
           while the server is not reporting a content length. */
        load(onProgress) {
            return new Promise((resolve, reject) => {
                new GLTFLoader().load(
                    MAP_MODEL,
                    (gltf) => {
                        model = gltf.scene;

                        const box = new THREE.Box3().setFromObject(model);
                        const size = box.getSize(new THREE.Vector3());
                        const center = box.getCenter(new THREE.Vector3());

                        /* Normalise to roughly unit scale so the camera clip
                           planes and marker sizes above stay meaningful
                           regardless of what units the export used. */
                        modelScale = 1 / Math.max(size.x, size.y, size.z);
                        model.position.copy(center).multiplyScalar(-1);
                        root.scale.setScalar(modelScale);

                        root.add(model);
                        const litMaterials = normalizeMaterials(model);

                        /* Model-local (0,0,0) is the export's own pivot. The
                           recentering offset lives on the model object, so
                           localToWorld resolves it through both that and the
                           root's Z-up rotation. */
                        root.updateMatrixWorld(true);
                        panBounds = new THREE.Box3().setFromObject(root);
                        panBounds.expandByVector(
                            panBounds.getSize(new THREE.Vector3())
                                .multiplyScalar((PAN_BOUNDS_SCALE - 1) / 2)
                        );
                        const pivot = model.localToWorld(new THREE.Vector3(0, 0, 0));

                        /* Before the capture, so reflections see the extended
                           sea rather than its original edge. */
                        //oceanQuad = extendOcean();
                        captureEnvironment(pivot);
                        frameOn(pivot, START_DISTANCE);
                        resolve({
                            size: size,
                            center: center,
                            pivot: pivot,
                            scale: modelScale,
                            panBounds: panBounds,
                            litMaterials: litMaterials
                        });
                    },
                    (e) => {
                        if (onProgress) onProgress(e.lengthComputable ? e.loaded / e.total : null);
                    },
                    reject
                );
            });
        },

        onPick(cb) { pickCallback = cb; },

        /* Debug aid: drops a pointer at a position in MODEL space - the same
           coordinates onPick reports and that location data is stored in - so a
           known landmark can be checked against where it actually lands.
           Accepts (x, y, z, color) or (vector, color). Returns a handle for
           removeMarker, or null if the city has not finished loading. */
        addMarker(x, y, z, color) {
            if (!model) return null;

            let point;
            let tint;
            if (x && typeof x === "object") {
                point = x;
                tint = y;
            } else {
                point = { x: x, y: y, z: z };
                tint = color;
            }

            const marker = makePointer(pointerTexture, tint === undefined ? DEBUG_COLOR : tint);
            marker.position.copy(toWorld(point));
            marker.visible = true;
            scene.add(marker);
            debugMarkers.push(marker);
            return marker;
        },

        /* Same as addMarker but taking raw Frostbite coordinates, so a position
           read out of the game can be dropped in without converting by hand. */
        addFrostbiteMarker(x, y, z, color) {
            const isVector = x && typeof x === "object";
            return this.addMarker(
                fromFrostbite(isVector ? x : { x: x, y: y, z: z }),
                isVector ? y : color
            );
        },

        removeMarker(marker) {
            const i = debugMarkers.indexOf(marker);
            if (i === -1) return false;

            debugMarkers.splice(i, 1);
            scene.remove(marker);
            /* Each marker owns its material because of the tint, but they all
               share one texture - which belongs to the map, not to them. */
            marker.material.dispose();
            return true;
        },

        clearDebugMarkers() {
            while (debugMarkers.length) this.removeMarker(debugMarkers[0]);
        },


        setGuess(modelPos) {
            guessMarker.position.copy(toWorld(modelPos));
            guessMarker.visible = true;
        },

        showAnswer(modelPos) {
            answerMarker.position.copy(toWorld(modelPos));
            answerMarker.visible = true;
        },

        clearMarkers() {
            guessMarker.visible = false;
            answerMarker.visible = false;
        },

        /* Frames both markers so the result screen shows how badly it went. */
        frameResult() {
            if (!guessMarker.visible || !answerMarker.visible) return;
            const mid = guessMarker.position.clone().add(answerMarker.position).multiplyScalar(0.5);
            const spread = guessMarker.position.distanceTo(answerMarker.position);
            /* Pull back far enough to fit the miss, with a floor so a near-
               perfect guess does not slam the camera into the rooftops. */
            frameOn(mid, Math.max(spread * 1.2, START_DISTANCE * 0.6));
        },

        dispose() {
            running = false;
            resizeObserver.disconnect();
            window.removeEventListener("pointerup", onPointerUp);
            mount.removeEventListener("contextmenu", onContextMenu);
            mount.removeEventListener("pointerdown", rejectRightButton, true);
            mount.removeEventListener("pointerup", rejectRightButton, true);
            controls.dispose();
            sky.dispose();
            while (debugMarkers.length) {
                const marker = debugMarkers.pop();
                scene.remove(marker);
                marker.material.dispose();
            }
            pointerTexture.dispose();
            if (environment) environment.dispose();
            if (oceanQuad) {
                scene.remove(oceanQuad);
                oceanQuad.geometry.dispose();
            }
            renderer.dispose();
            renderer.domElement.remove();
        }
    };
}
