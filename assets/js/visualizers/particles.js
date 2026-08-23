const Particles = {
    scene: null,
    camera: null,
    renderer: null,
    particleSystem: null,
    animationId: null,
    positions: null,
    initialPositions: null,
    count: 2000,

    init(canvas) {
        if (this.renderer) return;
        if (typeof THREE === 'undefined') return;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.z = 400;

        this.renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.initialPositions = new Float32Array(this.count * 3);
        const colors = new Float32Array(this.count * 3);

        for (let i = 0; i < this.count; i++) {
            const radius = 50 + Math.random() * 250;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);

            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);

            this.positions[i * 3] = x;
            this.positions[i * 3 + 1] = y;
            this.positions[i * 3 + 2] = z;

            this.initialPositions[i * 3] = x;
            this.initialPositions[i * 3 + 1] = y;
            this.initialPositions[i * 3 + 2] = z;

            // Gradient colors from pink/red to cyan
            const color = new THREE.Color();
            color.setHSL(0.9 + (radius / 250) * 0.4, 0.9, 0.6);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 3.5,
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            blending: THREE.AdditiveBlending
        });

        this.particleSystem = new THREE.Points(geometry, material);
        this.scene.add(this.particleSystem);
    },

    onResize(w, h) {
        if (this.camera && this.renderer) {
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        }
    },

    draw(analyser) {
        this.stop();
        if (!this.renderer || !this.particleSystem) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            Visualizer.animationId = this.animationId;
            analyser.getByteFrequencyData(dataArray);

            const bass = (dataArray[2] + dataArray[4] + dataArray[6]) / (3 * 255);
            const mids = (dataArray[20] + dataArray[30] + dataArray[40]) / (3 * 255);
            const highs = (dataArray[60] + dataArray[80] + dataArray[100]) / (3 * 255);

            const posAttr = this.particleSystem.geometry.attributes.position;
            const pos = posAttr.array;

            for (let i = 0; i < this.count; i++) {
                const i3 = i * 3;
                const freqIdx = i % bufferLength;
                const freqVal = (dataArray[freqIdx] / 255);
                const scale = 1 + (bass * 0.6) + (freqVal * 0.4);

                pos[i3] = this.initialPositions[i3] * scale;
                pos[i3 + 1] = this.initialPositions[i3 + 1] * scale;
                pos[i3 + 2] = this.initialPositions[i3 + 2] * scale;
            }
            posAttr.needsUpdate = true;

            this.particleSystem.rotation.y += 0.003 + (mids * 0.01);
            this.particleSystem.rotation.x += 0.001 + (highs * 0.005);

            this.renderer.render(this.scene, this.camera);
        };

        animate();
    },

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }
};

window.Particles = Particles;