const envSkybox = document.querySelector('.env-skybox');
const envViewport = document.querySelector('.env-viewport');

envViewport.style.position = 'fixed';
envViewport.style.top = '0';
envViewport.style.left = '0';
envViewport.style.width = '100%';
envViewport.style.height = '100%';
// Allow pointer events so we can drag. Set to 'none' again when done debugging.
envViewport.style.pointerEvents = 'auto';
envViewport.style.cursor = 'grab';

const randRange = (min, max) => min + Math.random() * (max - min);
const randSign = () => (Math.random() < 0.5 ? -1 : 1);

const driftSpeed = {
    x: randRange(0.15, 0.5) * randSign(),
    y: randRange(0.15, 0.5) * randSign(),
    z: randRange(0.15, 0.2) * randSign()
};

let rotX = randRange(0, 360);
let rotY = randRange(0, 360);
let rotZ = randRange(0, 360);

// Drag state
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartRotX = 0;
let dragStartRotY = 0;
const DRAG_SENSITIVITY = 0.3; // degrees per pixel

envViewport.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartRotX = rotX;
    dragStartRotY = rotY;
    envViewport.style.cursor = 'grabbing';
    e.preventDefault();
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    // Horizontal drag → yaw (Y), vertical drag → pitch (X)
    rotY = dragStartRotY + dx * DRAG_SENSITIVITY;
    rotX = dragStartRotX - dy * DRAG_SENSITIVITY;
});

window.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        envViewport.style.cursor = 'grab';
    }
});

let lastTime = performance.now();

function tick(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Only drift when not actively dragging
    if (!isDragging) {
        rotX += driftSpeed.x * dt;
        rotY += driftSpeed.y * dt;
        rotZ += driftSpeed.z * dt;
    }

    envSkybox.style.transform =
        `translate3d(-50%, -50%, 400px) ` +
        `rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`;

    requestAnimationFrame(tick);
}

requestAnimationFrame((t) => {
    lastTime = t;
    tick(t);
});