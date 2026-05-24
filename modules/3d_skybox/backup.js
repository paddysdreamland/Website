const envSkybox = document.querySelector('.env-skybox');
const initialTransform = envSkybox.style.transform;
const rotateYMatch = initialTransform.match(/rotateY\((-?\d+(?:\.\d+)?)deg\)/);
const rotateXMatch = initialTransform.match(/rotateX\((-?\d+(?:\.\d+)?)deg\)/);
const initialRotateY = rotateYMatch ? parseFloat(rotateYMatch[1]) : 0;
const initialRotateX = rotateXMatch ? parseFloat(rotateXMatch[1]) : 0;
const envViewport = document.querySelector('.env-viewport');
envViewport.style.position = 'fixed';
envViewport.style.top = '0';
envViewport.style.left = '0';
envViewport.style.width = '100%';
envViewport.style.height = '100%';
envViewport.style.pointerEvents = 'none';

window.addEventListener('mousemove', (event) => {
    const { clientX, clientY } = event;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const mouseXPercent = clientX / viewportWidth;
    const mouseYPercent = clientY / viewportHeight;
    const rotateYOffset = (mouseXPercent - 0.5) * 20;
    const rotateXOffset = (mouseYPercent - 0.5) * -20;

    envSkybox.style.transform = `translate3d(-50%, -50%, 400px) rotateX(${initialRotateX + rotateXOffset}deg) rotateY(${initialRotateY + rotateYOffset}deg)`;
});