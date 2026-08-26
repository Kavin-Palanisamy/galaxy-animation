/**
 * Deep Space 3D Interactive Galaxy Simulation
 * High-performance particle physics & WebGL rendering with Canvas fallback
 */

const GalaxyApp = (() => {
    // Configuration Parameters
    const parameters = {
        count: 120000,
        size: 0.015,
        radius: 6.5,
        branches: 4,
        spin: 1.2,
        randomness: 0.45,
        power: 3.5,
        insideColor: '#ff8a5c',
        outsideColor: '#5824ff',
        coreRadius: 0.8,
        rotationSpeed: 0.15,
        warpSpeed: false,
        soundEnabled: false,
        theme: 'milkyway'
    };

    const themes = {
        milkyway: { inside: '#ffe5a3', outside: '#38bdf8', branches: 4, spin: 1.1 },
        andromeda: { inside: '#f472b6', outside: '#818cf8', branches: 3, spin: 1.4 },
        supernova: { inside: '#fbbf24', outside: '#ef4444', branches: 5, spin: 0.9 },
        cyberpunk: { inside: '#ec4899', outside: '#06b6d4', branches: 6, spin: 1.6 },
        emerald: { inside: '#a7f3d0', outside: '#059669', branches: 4, spin: 1.3 },
        singularity: { inside: '#ffffff', outside: '#334155', branches: 2, spin: 2.0 }
    };

    let scene, camera, renderer, points, geometry, material;
    let clock, mouseX = 0, mouseY = 0, targetRotationX = 0, targetRotationY = 0;
    let isDragging = false, previousMousePosition = { x: 0, y: 0 };
    let cameraDistance = 9;
    let audioCtx, ambientOsc1, ambientOsc2, ambientGain, filterNode;
    let shockwaves = [];
    let isThreeLoaded = false;

    // Helper: Create circular glowing particle texture
    function createParticleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.2, 'rgba(255, 255, 255, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.2)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);

        if (window.THREE) {
            const texture = new THREE.CanvasTexture(canvas);
            texture.needsUpdate = true;
            return texture;
        }
        return canvas;
    }

    // Audio Synthesizer for Space Atmosphere
    function toggleAudio() {
        if (!parameters.soundEnabled) {
            if (!audioCtx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioCtx = new AudioContext();

                // Master Filter
                filterNode = audioCtx.createBiquadFilter();
                filterNode.type = 'lowpass';
                filterNode.frequency.setValueAtTime(450, audioCtx.currentTime);

                ambientGain = audioCtx.createGain();
                ambientGain.gain.setValueAtTime(0.08, audioCtx.currentTime);

                // Deep Cosmic Drone Osc 1
                ambientOsc1 = audioCtx.createOscillator();
                ambientOsc1.type = 'sawtooth';
                ambientOsc1.frequency.setValueAtTime(55, audioCtx.currentTime); // A1 note

                // Ethereal Osc 2
                ambientOsc2 = audioCtx.createOscillator();
                ambientOsc2.type = 'sine';
                ambientOsc2.frequency.setValueAtTime(110.5, audioCtx.currentTime);

                ambientOsc1.connect(filterNode);
                ambientOsc2.connect(filterNode);
                filterNode.connect(ambientGain);
                ambientGain.connect(audioCtx.destination);

                ambientOsc1.start();
                ambientOsc2.start();
            } else if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
            parameters.soundEnabled = true;
            document.getElementById('audio-btn')?.classList.add('active');
        } else {
            if (audioCtx) {
                audioCtx.suspend();
            }
            parameters.soundEnabled = false;
            document.getElementById('audio-btn')?.classList.remove('active');
        }
    }

    function playPulseSound(freq = 220) {
        if (!parameters.soundEnabled || !audioCtx) return;
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(freq * 2.5, audioCtx.currentTime + 0.6);

            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.6);
        } catch (err) {
            console.warn(err);
        }
    }

    // Generate Galaxy Geometry
    function generateGalaxy() {
        if (!window.THREE) {
            init2DFallback();
            return;
        }

        // Clean up previous
        if (points !== undefined) {
            geometry.dispose();
            material.dispose();
            scene.remove(points);
        }

        // Geometry
        geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(parameters.count * 3);
        const colors = new Float32Array(parameters.count * 3);
        const scales = new Float32Array(parameters.count);
        const randomness = new Float32Array(parameters.count * 3);

        const colorInside = new THREE.Color(parameters.insideColor);
        const colorOutside = new THREE.Color(parameters.outsideColor);

        for (let i = 0; i < parameters.count; i++) {
            // Position Calculation
            const i3 = i * 3;
            const r = Math.pow(Math.random(), parameters.power) * parameters.radius;
            const branchAngle = ((i % parameters.branches) / parameters.branches) * Math.PI * 2;
            const spinAngle = r * parameters.spin;

            // Random dispersion offsets
            const randomX = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * r;
            const randomY = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * (r * 0.6);
            const randomZ = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? 1 : -1) * parameters.randomness * r;

            positions[i3] = Math.cos(branchAngle + spinAngle) * r + randomX;
            positions[i3 + 1] = randomY;
            positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * r + randomZ;

            // Color gradient from core to arm edge
            const mixedColor = colorInside.clone();
            mixedColor.lerp(colorOutside, r / parameters.radius);

            // Add starlight vibrancy
            const brightness = 0.8 + Math.random() * 0.6;
            colors[i3] = Math.min(1, mixedColor.r * brightness);
            colors[i3 + 1] = Math.min(1, mixedColor.g * brightness);
            colors[i3 + 2] = Math.min(1, mixedColor.b * brightness);

            // Varied star scales
            scales[i] = Math.random() * 1.5 + 0.5;

            // Save randomness for animated ripples
            randomness[i3] = randomX;
            randomness[i3 + 1] = randomY;
            randomness[i3 + 2] = randomZ;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));

        // Material with additive blending
        const particleTexture = createParticleTexture();
        material = new THREE.PointsMaterial({
            size: parameters.size,
            sizeAttenuation: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            vertexColors: true,
            map: particleTexture,
            transparent: true,
            opacity: 0.95
        });

        // Points Mesh
        points = new THREE.Points(geometry, material);
        scene.add(points);
    }

    // Initialize Three.js Scene
    function initThree() {
        const container = document.getElementById('canvas-container');
        scene = new THREE.Scene();
        clock = new THREE.Clock();

        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 5.5, cameraDistance);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        generateGalaxy();
        setupEventListeners();
        animate();
    }

    // Interactive Animation Loop
    function animate() {
        requestAnimationFrame(animate);

        const elapsedTime = clock.getElapsedTime();

        if (points) {
            // Galaxy auto rotation
            const speed = parameters.warpSpeed ? parameters.rotationSpeed * 5 : parameters.rotationSpeed;
            points.rotation.y = elapsedTime * speed * 0.3;

            // Warp speed camera effect
            if (parameters.warpSpeed) {
                camera.position.z += (3 - camera.position.z) * 0.05;
                camera.position.y += (1 - camera.position.y) * 0.05;
                material.size = parameters.size * 2.2;
            } else {
                camera.position.z += (cameraDistance - camera.position.z) * 0.05;
                camera.position.y += (4.5 - camera.position.y) * 0.05;
                material.size = parameters.size;
            }

            // Smooth mouse rotation damping
            points.rotation.x += (targetRotationX - points.rotation.x) * 0.05;
            points.rotation.z += (targetRotationY - points.rotation.z) * 0.05;

            // Shockwave expansions
            for (let i = shockwaves.length - 1; i >= 0; i--) {
                const sw = shockwaves[i];
                sw.radius += 0.12;
                sw.intensity *= 0.94;
                if (sw.intensity < 0.01) {
                    shockwaves.splice(i, 1);
                }
            }
        }

        camera.lookAt(0, 0, 0);
        renderer.render(scene, camera);
    }

    // Shockwave particle burst on user click
    function triggerShockwave(x, y) {
        shockwaves.push({ radius: 0.1, intensity: 1.0 });
        playPulseSound(320 + Math.random() * 200);

        // Gentle camera pulse
        if (camera) {
            camera.position.z -= 0.3;
        }
    }

    // Set Theme Preset
    function applyTheme(themeKey) {
        const theme = themes[themeKey];
        if (!theme) return;

        parameters.theme = themeKey;
        parameters.insideColor = theme.inside;
        parameters.outsideColor = theme.outside;
        parameters.branches = theme.branches;
        parameters.spin = theme.spin;

        document.querySelectorAll('.theme-pill').forEach(el => {
            el.classList.toggle('active', el.dataset.theme === themeKey);
        });

        generateGalaxy();
        playPulseSound(440);
    }

    // Event Listeners
    function setupEventListeners() {
        const container = document.getElementById('canvas-container');

        window.addEventListener('resize', () => {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        });

        // Mouse Drag / Touch Controls
        window.addEventListener('mousedown', (e) => {
            if (e.target.closest('.controls-dock') || e.target.closest('.settings-panel') || e.target.closest('.top-nav')) return;
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;

            targetRotationY += deltaX * 0.005;
            targetRotationX += deltaY * 0.005;

            previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        window.addEventListener('mouseup', () => { isDragging = false; });

        // Touch support
        window.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1 && !e.target.closest('.controls-dock') && !e.target.closest('.settings-panel') && !e.target.closest('.top-nav')) {
                isDragging = true;
                previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
        });

        window.addEventListener('touchmove', (e) => {
            if (!isDragging || e.touches.length !== 1) return;
            const deltaX = e.touches[0].clientX - previousMousePosition.x;
            const deltaY = e.touches[0].clientY - previousMousePosition.y;

            targetRotationY += deltaX * 0.008;
            targetRotationX += deltaY * 0.008;

            previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });

        window.addEventListener('touchend', () => { isDragging = false; });

        // Zoom with wheel
        window.addEventListener('wheel', (e) => {
            if (e.target.closest('.settings-panel')) return;
            cameraDistance += e.deltaY * 0.005;
            cameraDistance = Math.max(2.5, Math.min(18, cameraDistance));
        }, { passive: true });

        // Particle Burst on Click
        window.addEventListener('click', (e) => {
            if (e.target.closest('.controls-dock') || e.target.closest('.settings-panel') || e.target.closest('.top-nav')) return;
            triggerShockwave(e.clientX, e.clientY);
        });

        // UI Controls Interaction
        document.getElementById('warp-btn')?.addEventListener('click', () => {
            parameters.warpSpeed = !parameters.warpSpeed;
            const btn = document.getElementById('warp-btn');
            btn.classList.toggle('active', parameters.warpSpeed);
            playPulseSound(parameters.warpSpeed ? 600 : 200);
        });

        document.getElementById('audio-btn')?.addEventListener('click', toggleAudio);

        document.getElementById('settings-btn')?.addEventListener('click', () => {
            document.getElementById('settings-panel')?.classList.toggle('open');
        });

        document.getElementById('close-settings')?.addEventListener('click', () => {
            document.getElementById('settings-panel')?.classList.remove('open');
        });

        // Sliders
        const countSlider = document.getElementById('count-slider');
        countSlider?.addEventListener('input', (e) => {
            parameters.count = parseInt(e.target.value);
            document.getElementById('count-val').innerText = parameters.count.toLocaleString();
            generateGalaxy();
        });

        const branchesSlider = document.getElementById('branches-slider');
        branchesSlider?.addEventListener('input', (e) => {
            parameters.branches = parseInt(e.target.value);
            document.getElementById('branches-val').innerText = parameters.branches;
            generateGalaxy();
        });

        const speedSlider = document.getElementById('speed-slider');
        speedSlider?.addEventListener('input', (e) => {
            parameters.rotationSpeed = parseFloat(e.target.value);
            document.getElementById('speed-val').innerText = parameters.rotationSpeed.toFixed(2) + 'x';
        });

        const sizeSlider = document.getElementById('size-slider');
        sizeSlider?.addEventListener('input', (e) => {
            parameters.size = parseFloat(e.target.value);
            document.getElementById('size-val').innerText = parameters.size.toFixed(3);
            if (material) material.size = parameters.size;
        });

        // Theme Pills
        document.querySelectorAll('.theme-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                applyTheme(pill.dataset.theme);
            });
        });

        // Reset Camera
        document.getElementById('reset-btn')?.addEventListener('click', () => {
            targetRotationX = 0;
            targetRotationY = 0;
            cameraDistance = 9;
            parameters.warpSpeed = false;
            document.getElementById('warp-btn')?.classList.remove('active');
        });

        // Fullscreen
        document.getElementById('fullscreen-btn')?.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
            } else {
                document.exitFullscreen().catch(() => {});
            }
        });
    }

    // High performance 2D Canvas Fallback if WebGL/Three is unavailable
    function init2DFallback() {
        const container = document.getElementById('canvas-container');
        const canvas = document.createElement('canvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        container.appendChild(canvas);
        const ctx = canvas.getContext('2d');

        let angle = 0;
        const stars = [];
        for (let i = 0; i < 3000; i++) {
            const r = Math.pow(Math.random(), 2.5) * (Math.min(canvas.width, canvas.height) * 0.45);
            const branch = ((i % 4) / 4) * Math.PI * 2;
            const spin = r * 0.015;
            stars.push({
                dist: r,
                branch: branch,
                spin: spin,
                offset: (Math.random() - 0.5) * (r * 0.3),
                size: Math.random() * 2 + 0.5,
                color: i % 2 === 0 ? '#38bdf8' : '#ec4899'
            });
        }

        function draw2D() {
            ctx.fillStyle = 'rgba(3, 0, 20, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const cx = canvas.width / 2;
            const cy = canvas.height / 2;
            angle += 0.005;

            stars.forEach(s => {
                const a = s.branch + s.spin + angle;
                const x = cx + Math.cos(a) * (s.dist + s.offset);
                const y = cy + Math.sin(a) * (s.dist * 0.5 + s.offset * 0.5);

                ctx.fillStyle = s.color;
                ctx.beginPath();
                ctx.arc(x, y, s.size, 0, Math.PI * 2);
                ctx.fill();
            });

            requestAnimationFrame(draw2D);
        }
        draw2D();
    }

    return {
        init: () => {
            if (window.THREE) {
                initThree();
            } else {
                // Wait briefly for Three.js script to execute or fallback
                let checks = 0;
                const interval = setInterval(() => {
                    checks++;
                    if (window.THREE) {
                        clearInterval(interval);
                        initThree();
                    } else if (checks > 10) {
                        clearInterval(interval);
                        init2DFallback();
                    }
                }, 100);
            }
        }
    };
})();

document.addEventListener('DOMContentLoaded', () => {
    GalaxyApp.init();
});
