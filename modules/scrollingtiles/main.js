(function () {
    // scope everything so multiple modules don't collide
    const root = document.currentScript.parentElement;
    const bg = root.querySelector('.background');
    const bgNormal = root.querySelector('.bg-normal');
    const bgNoise = root.querySelector('.bg-noise');

    const TILE_X = 270 * 2;
    const TILE_Y = 135 * 2;

    const debugEl = document.getElementById('debug');

    let theta = 0, thetaSpeed = 0.1, thetaSpeedTarget = 0.1;
    let piston = 0, pistonSpeed = 0.1, pistonSpeedTarget = 0.1;
    const EASE = 0.25;

    let nextThetaChange = 0;
    let nextPistonChange = 0;

    function rerollTheta() {
        const mag = 0.05 + Math.random() * 0.15;
        const keep = Math.random() < 0.8;
        const currentSign = Math.sign(thetaSpeedTarget) || 1;
        thetaSpeedTarget = mag * (keep ? currentSign : -currentSign);
    }

    function rerollPiston() {
        const mag = 0.05 + Math.random() * 0.2;
        const keep = Math.random() < 0.8;
        const currentSign = Math.sign(pistonSpeedTarget) || 1;
        pistonSpeedTarget = mag * (keep ? currentSign : -currentSign);
    }

    function mod(n, m) { return ((n % m) + m) % m; }

    let lastTime = performance.now() / 1000;
    nextThetaChange = lastTime + 5 + Math.random() * 8;
    nextPistonChange = lastTime + 5 + Math.random() * 8;

    function frame(nowMs) {
        const now = nowMs / 1000;
        const dt = Math.min(0.05, now - lastTime);
        lastTime = now;

        if (now >= nextThetaChange) {
            rerollTheta();
            nextThetaChange = now + 5 + Math.random() * 8;
        }
        if (now >= nextPistonChange) {
            rerollPiston();
            nextPistonChange = now + 5 + Math.random() * 8;
        }

        thetaSpeed += (thetaSpeedTarget - thetaSpeed) * Math.min(1, EASE * dt);
        pistonSpeed += (pistonSpeedTarget - pistonSpeed) * Math.min(1, EASE * dt);

        theta += thetaSpeed * dt;
        piston += pistonSpeed * dt;

        const x = Math.cos(theta) * piston;
        const y = Math.sin(theta) * piston;

        const px = mod(x * TILE_X, TILE_X);
        const py = mod(y * TILE_Y, TILE_Y);

        if (bg) bg.style.backgroundPosition = `${px}px ${py}px`;
        if (bgNormal) bgNormal.style.backgroundPosition = `${px}px ${py}px`;
        if (bgNoise) bgNoise.style.backgroundPosition = `${px}px ${py}px`;

        debugEl.textContent =
            `theta:       ${theta.toFixed(2)} rad\n` +
            `theta speed: ${thetaSpeed.toFixed(2)} (-> ${thetaSpeedTarget.toFixed(2)})\n` +
            `piston:      ${piston.toFixed(2)}\n` +
            `piston spd:  ${pistonSpeed.toFixed(2)} (-> ${pistonSpeedTarget.toFixed(2)})`;

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
})();