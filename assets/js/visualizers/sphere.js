const Sphere = {
    scene: null,
    camera: null,
    renderer: null,
    outerMesh: null,
    innerMesh: null,
    animationId: null,

    init(canvas) {
        if (this.renderer) return;
        if (typeof THREE === 'undefined') return;

        const targetCanvas = canvas || document.getElementById('visualizer-canvas-3d');
        if (!targetCanvas) return;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.z = 5;

        this.renderer = new THREE.WebGLRenderer({ canvas: targetCanvas, alpha: true, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        // Outer Wireframe Sphere
        const outerGeo = new THREE.IcosahedronGeometry(2, 4);
        const outerMat = new THREE.MeshStandardMaterial({
            color: 0xfa233b,
            wireframe: true,
            emissive: 0x4a0a15,
            roughness: 0.2
        });
        this.outerMesh = new THREE.Mesh(outerGeo, outerMat);
        this.scene.add(this.outerMesh);

        // Inner Glowing Core
        const innerGeo = new THREE.SphereGeometry(1.2, 32, 32);
        const innerMat = new THREE.MeshBasicMaterial({
            color: 0x00f0ff,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });
        this.innerMesh = new THREE.Mesh(innerGeo, innerMat);
        this.scene.add(this.innerMesh);

        // Lights
        const pointLight = new THREE.PointLight(0xffffff, 2, 50);
        pointLight.position.set(5, 5, 5);
        this.scene.add(pointLight);

        const ambientLight = new THREE.AmbientLight(0x222233);
        this.scene.add(ambientLight);
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
        if (!this.renderer || !this.outerMesh) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const animate = () => {
            this.animationId = requestAnimationFrame(animate);
            Visualizer.animationId = this.animationId;
            analyser.getByteFrequencyData(dataArray);

            const bass = (dataArray[2] + dataArray[4] + dataArray[6]) / (3 * 255);
            const mids = (dataArray[20] + dataArray[30]) / (2 * 255);
            const highs = (dataArray[70] + dataArray[90]) / (2 * 255);

            const outerScale = 1 + (bass * 0.55);
            this.outerMesh.scale.set(outerScale, outerScale, outerScale);
            this.outerMesh.rotation.x += 0.008 + (mids * 0.02);
            this.outerMesh.rotation.y += 0.01 + (highs * 0.02);

            const innerScale = 1 + (highs * 0.4);
            this.innerMesh.scale.set(innerScale, innerScale, innerScale);
            this.innerMesh.rotation.x -= 0.015;
            this.innerMesh.rotation.z += 0.01;

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

window.Sphere = Sphere;