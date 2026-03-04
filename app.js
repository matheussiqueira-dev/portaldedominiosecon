(function () {
  function initBackground() {
    const bgRoot = document.getElementById("bg3d");
    if (!bgRoot) throw new Error("Missing #bg3d container.");
    if (!window.THREE) throw new Error("Three.js was not loaded.");

    // Configuration
    const STAR_COUNT = 20000;
    const CYLINDER_RADIUS = 300;
    const CYLINDER_DEPTH = 4500;
    const WRAP_NEAR_Z = 100;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x010206, 1);
    bgRoot.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x010206, 0.0012);

    const camera3d = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 8000);
    camera3d.position.z = 0;
    const orbitControls =
      THREE.OrbitControls ? new THREE.OrbitControls(camera3d, renderer.domElement) : null;
    if (orbitControls) {
      orbitControls.enableDamping = true;
      orbitControls.dampingFactor = 0.06;
      orbitControls.rotateSpeed = 0.72;
      orbitControls.enablePan = false;
      orbitControls.minDistance = 30;
      orbitControls.maxDistance = 240;
      orbitControls.enabled = false;
    }
    const redCameraShake = new THREE.Vector3();

    // --- Starfield Construction ---
    const positions = new Float32Array(STAR_COUNT * 3);
    const speeds = new Float32Array(STAR_COUNT);
    const trailPositions = new Float32Array(STAR_COUNT * 6);
    const trailColors = new Float32Array(STAR_COUNT * 6);
    const headColor = new THREE.Color();
    const tailColor = new THREE.Color();
    
    function resetStar(i) {
      const p = i * 3;
      const angle = Math.random() * Math.PI * 2;
      const radius = 10 + Math.sqrt(Math.random()) * CYLINDER_RADIUS; // Hollow center
      positions[p] = Math.cos(angle) * radius;
      positions[p + 1] = Math.sin(angle) * radius;
      positions[p + 2] = -Math.random() * CYLINDER_DEPTH;
      speeds[i] = 0.5 + Math.random() * 2.0;
    }

    function writeContrail(i, speedBoost = 0) {
      const p = i * 3;
      const t = i * 6;
      const len = 14 + speeds[i] * 26 + speedBoost;
      const hue = (0.54 + (speeds[i] - 0.5) * 0.08) % 1;

      trailPositions[t] = positions[p];
      trailPositions[t + 1] = positions[p + 1];
      trailPositions[t + 2] = positions[p + 2];
      trailPositions[t + 3] = positions[p];
      trailPositions[t + 4] = positions[p + 1];
      trailPositions[t + 5] = positions[p + 2] - len;

      headColor.setHSL(hue, 0.95, 0.8);
      tailColor.setHSL((hue + 0.08) % 1, 0.95, 0.35);
      trailColors[t] = headColor.r;
      trailColors[t + 1] = headColor.g;
      trailColors[t + 2] = headColor.b;
      trailColors[t + 3] = tailColor.r;
      trailColors[t + 4] = tailColor.g;
      trailColors[t + 5] = tailColor.b;
    }

    for (let i = 0; i < STAR_COUNT; i++) {
      resetStar(i);
      writeContrail(i);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(trailColors, 3));

    const starMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const stars = new THREE.LineSegments(geometry, starMaterial);
    scene.add(stars);

    // --- Central Radial Glow ---
    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 256; glowCanvas.height = 256;
    const glowCtx = glowCanvas.getContext("2d");
    const grad = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255, 255, 255, 1)");
    grad.addColorStop(0.2, "rgba(100, 150, 255, 0.4)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    glowCtx.fillStyle = grad;
    glowCtx.fillRect(0, 0, 256, 256);

    const radialGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(glowCanvas),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    }));
    radialGlow.scale.set(1000, 1000, 1);
    radialGlow.position.z = -1200;
    scene.add(radialGlow);

    let detectTarget = 0;
    let detectMix = 0;
    let currentSpeed = 0;
    let activeSign = null;
    let pendingSign = null;
    let signTransitionActive = false;
    let signTransitionPhase = 0; // 0: gather current scene, 1: release into next scene
    let signTransitionFrame = 0;
    const SIGN_TRANSITION_GATHER_FRAMES = 24;
    const SIGN_TRANSITION_RELEASE_FRAMES = 20;
    const SIGN_TRANSITION_PARTICLES = 2600;
    const signTransitionPos = new Float32Array(SIGN_TRANSITION_PARTICLES * 3);
    const signTransitionVel = new Float32Array(SIGN_TRANSITION_PARTICLES * 3);
    const signTransitionCol = new Float32Array(SIGN_TRANSITION_PARTICLES * 3);
    const signTransitionGeo = new THREE.BufferGeometry();
    const signTransitionColor = new THREE.Color(0xff8b8b);
    for (let i = 0; i < SIGN_TRANSITION_PARTICLES; i += 1) {
      const p = i * 3;
      signTransitionPos[p] = (Math.random() - 0.5) * 220;
      signTransitionPos[p + 1] = (Math.random() - 0.5) * 120;
      signTransitionPos[p + 2] = (Math.random() - 0.5) * 320;
      signTransitionVel[p] = 0;
      signTransitionVel[p + 1] = 0;
      signTransitionVel[p + 2] = 0;
      signTransitionCol[p] = signTransitionColor.r;
      signTransitionCol[p + 1] = signTransitionColor.g;
      signTransitionCol[p + 2] = signTransitionColor.b;
    }
    signTransitionGeo.setAttribute("position", new THREE.BufferAttribute(signTransitionPos, 3));
    signTransitionGeo.setAttribute("color", new THREE.BufferAttribute(signTransitionCol, 3));
    const signTransitionMat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 1.1,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const signTransitionPoints = new THREE.Points(signTransitionGeo, signTransitionMat);
    signTransitionPoints.visible = false;
    scene.add(signTransitionPoints);

    function seedSignTransitionGather() {
      for (let i = 0; i < SIGN_TRANSITION_PARTICLES; i += 1) {
        const p = i * 3;
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const shell = Math.sqrt(1 - u * u);
        const radius = 85 + Math.random() * 210;
        const x = Math.cos(theta) * shell * radius;
        const y = u * radius * 0.65;
        const z = Math.sin(theta) * shell * radius;
        const dist = Math.hypot(x, y, z) || 1e-6;
        signTransitionPos[p] = x;
        signTransitionPos[p + 1] = y;
        signTransitionPos[p + 2] = z;
        const pull = 2 + Math.random() * 4.5;
        signTransitionVel[p] = -(x / dist) * pull + (Math.random() - 0.5) * 0.25;
        signTransitionVel[p + 1] = -(y / dist) * pull + (Math.random() - 0.5) * 0.25;
        signTransitionVel[p + 2] = -(z / dist) * pull + (Math.random() - 0.5) * 0.25;
      }
      signTransitionGeo.attributes.position.needsUpdate = true;
    }

    function seedSignTransitionRelease() {
      for (let i = 0; i < SIGN_TRANSITION_PARTICLES; i += 1) {
        const p = i * 3;
        const theta = Math.random() * Math.PI * 2;
        const u = Math.random() * 2 - 1;
        const shell = Math.sqrt(1 - u * u);
        const radius = Math.random() * 8;
        const x = Math.cos(theta) * shell * radius;
        const y = u * radius * 0.55;
        const z = Math.sin(theta) * shell * radius;
        signTransitionPos[p] = x;
        signTransitionPos[p + 1] = y;
        signTransitionPos[p + 2] = z;
        const burst = 3.5 + Math.random() * 7;
        signTransitionVel[p] = (x === 0 ? Math.cos(theta) * shell : x / (radius + 1e-6)) * burst;
        signTransitionVel[p + 1] = (y === 0 ? u : y / (radius + 1e-6)) * burst * 0.75;
        signTransitionVel[p + 2] = (z === 0 ? Math.sin(theta) * shell : z / (radius + 1e-6)) * burst;
      }
      signTransitionGeo.attributes.position.needsUpdate = true;
    }

    function startSignTransition(nextSign) {
      pendingSign = nextSign;
      signTransitionActive = true;
      signTransitionPhase = 0;
      signTransitionFrame = 0;
      signTransitionPoints.visible = true;
      signTransitionMat.opacity = 0.9;
      signTransitionMat.size = 1.2;
      seedSignTransitionGather();
    }

    function updateSignTransition() {
      if (!signTransitionActive) return;
      signTransitionFrame += 1;

      if (signTransitionPhase === 0) {
        // Consolidation phase: particles collapse inward.
        for (let i = 0; i < SIGN_TRANSITION_PARTICLES; i += 1) {
          const p = i * 3;
          const x = signTransitionPos[p];
          const y = signTransitionPos[p + 1];
          const z = signTransitionPos[p + 2];
          const dist = Math.hypot(x, y, z) || 1e-6;
          const pull = 0.15 + Math.max(0, 1 - dist / 250) * 0.22;
          signTransitionVel[p] += -(x / dist) * pull;
          signTransitionVel[p + 1] += -(y / dist) * pull;
          signTransitionVel[p + 2] += -(z / dist) * pull;
          signTransitionVel[p] *= 0.9;
          signTransitionVel[p + 1] *= 0.9;
          signTransitionVel[p + 2] *= 0.9;
          signTransitionPos[p] += signTransitionVel[p];
          signTransitionPos[p + 1] += signTransitionVel[p + 1];
          signTransitionPos[p + 2] += signTransitionVel[p + 2];
        }
        signTransitionMat.opacity = 0.7 + (1 - signTransitionFrame / SIGN_TRANSITION_GATHER_FRAMES) * 0.3;
        signTransitionMat.size = 1.15;

        if (signTransitionFrame >= SIGN_TRANSITION_GATHER_FRAMES) {
          if (activeSign) backgroundAnimations[activeSign].exit();
          activeSign = pendingSign;
          pendingSign = null;
          if (activeSign) {
            backgroundAnimations[activeSign].enter();
            detectTarget = 1;
          } else {
            detectTarget = 0;
          }
          signTransitionPhase = 1;
          signTransitionFrame = 0;
          seedSignTransitionRelease();
        }
      } else {
        // Formation phase: particles burst and reveal next scene.
        for (let i = 0; i < SIGN_TRANSITION_PARTICLES; i += 1) {
          const p = i * 3;
          signTransitionVel[p] *= 0.95;
          signTransitionVel[p + 1] *= 0.95;
          signTransitionVel[p + 2] *= 0.95;
          signTransitionPos[p] += signTransitionVel[p];
          signTransitionPos[p + 1] += signTransitionVel[p + 1];
          signTransitionPos[p + 2] += signTransitionVel[p + 2];
        }
        signTransitionMat.opacity = Math.max(0, 1 - signTransitionFrame / SIGN_TRANSITION_RELEASE_FRAMES);
        signTransitionMat.size = 0.9;

        if (signTransitionFrame >= SIGN_TRANSITION_RELEASE_FRAMES) {
          signTransitionActive = false;
          signTransitionPoints.visible = false;
          signTransitionMat.opacity = 0;
          signTransitionFrame = 0;
        }
      }

      signTransitionGeo.attributes.position.needsUpdate = true;
    }

    // --- Black Hole Ring (single camera-aligned accretion ring) ---
    const BLACK_RING_COUNT = 3400;
    const ringPositions = new Float32Array(BLACK_RING_COUNT * 3);
    const ringColors = new Float32Array(BLACK_RING_COUNT * 3);
    const ringGeometry = new THREE.BufferGeometry();

    function fillRing(positionsArray, colorsArray, count, minRadius, maxRadius, hueA, hueB, sat, lightBase) {
      const c = new THREE.Color();
      for (let i = 0; i < count; i += 1) {
        const p = i * 3;
        const angle = Math.random() * Math.PI * 2;
        const distance = minRadius + Math.random() * (maxRadius - minRadius);
        const jitterZ = (Math.random() - 0.5) * 8;
        positionsArray[p] = Math.cos(angle) * distance;
        positionsArray[p + 1] = Math.sin(angle) * distance;
        positionsArray[p + 2] = jitterZ;

        const hue = hueA + Math.random() * (hueB - hueA);
        const light = lightBase + Math.random() * 0.15;
        c.setHSL(hue, sat, light);
        colorsArray[p] = c.r;
        colorsArray[p + 1] = c.g;
        colorsArray[p + 2] = c.b;
      }
    }

    fillRing(ringPositions, ringColors, BLACK_RING_COUNT, 74, 130, 0.62, 0.78, 0.85, 0.42);

    ringGeometry.setAttribute("position", new THREE.BufferAttribute(ringPositions, 3));
    ringGeometry.setAttribute("color", new THREE.BufferAttribute(ringColors, 3));

    const ringMaterial = new THREE.PointsMaterial({
      size: 1.65,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ringMesh = new THREE.Points(ringGeometry, ringMaterial);
    ringMesh.position.z = -150;
    scene.add(ringMesh);

    // --- Malevolent Shrine Configuration (integrated from provided scene) ---
    const SHRINE_WORLD_Z = -48;
    const shrineAmbientLight = new THREE.AmbientLight(0x222222);
    shrineAmbientLight.visible = false;
    scene.add(shrineAmbientLight);

    const shrineDirectionalLight = new THREE.DirectionalLight(0x555577, 0.5);
    shrineDirectionalLight.position.set(20, 50, 20);
    shrineDirectionalLight.visible = false;
    scene.add(shrineDirectionalLight);

    const shrineCoreLight = new THREE.PointLight(0xff0000, 2, 100);
    shrineCoreLight.position.set(0, 15, SHRINE_WORLD_Z);
    shrineCoreLight.visible = false;
    scene.add(shrineCoreLight);
    const shrineFillLight = new THREE.PointLight(0xff5522, 1.8, 180);
    shrineFillLight.position.set(0, 34, SHRINE_WORLD_Z + 8);
    shrineFillLight.visible = false;
    scene.add(shrineFillLight);

    const shrineGroup = new THREE.Group();
    shrineGroup.position.z = SHRINE_WORLD_Z;
    shrineGroup.visible = false;
    const shrineBodyMat = new THREE.MeshStandardMaterial({
      color: 0x641010,
      emissive: 0x260404,
      emissiveIntensity: 0.8,
      roughness: 0.55,
      metalness: 0.18,
    });
    const shrineTrimMat = new THREE.MeshStandardMaterial({
      color: 0x230202,
      emissive: 0x140101,
      emissiveIntensity: 0.5,
      roughness: 0.48,
      metalness: 0.2,
    });
    const tier1 = new THREE.Mesh(new THREE.BoxGeometry(52, 4, 52), shrineTrimMat);
    tier1.position.y = 2;
    const tier2 = new THREE.Mesh(new THREE.BoxGeometry(36, 8, 36), shrineBodyMat);
    tier2.position.y = 8;
    const tier3 = new THREE.Mesh(new THREE.BoxGeometry(22, 13, 22), shrineBodyMat);
    tier3.position.y = 18;
    const roof1 = new THREE.Mesh(new THREE.ConeGeometry(30, 8, 4), shrineTrimMat);
    roof1.position.y = 14;
    roof1.rotation.y = Math.PI * 0.25;
    const roof2 = new THREE.Mesh(new THREE.ConeGeometry(20, 6, 4), shrineTrimMat);
    roof2.position.y = 28;
    roof2.rotation.y = Math.PI * 0.25;
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 7, 6), shrineTrimMat);
    spire.position.y = 34;

    const gateLeft = new THREE.Mesh(new THREE.BoxGeometry(2.8, 16, 2.8), shrineBodyMat);
    gateLeft.position.set(-21, 8, 18);
    const gateRight = gateLeft.clone();
    gateRight.position.x = 21;
    const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(48, 2.4, 3.2), shrineTrimMat);
    gateBeam.position.set(0, 15.2, 18);
    const gateTop = new THREE.Mesh(new THREE.BoxGeometry(56, 2.1, 4), shrineTrimMat);
    gateTop.position.set(0, 18, 18);

    shrineGroup.add(
      tier1,
      tier2,
      tier3,
      roof1,
      roof2,
      spire,
      gateLeft,
      gateRight,
      gateBeam,
      gateTop,
    );
    scene.add(shrineGroup);
    shrineGroup.visible = false;

    // Particle-built shrine silhouette (bright red), replaces solid rotating shrine body.
    const shrineParticleList = [];
    function addBoxParticles(count, w, h, d, cx, cy, cz) {
      for (let i = 0; i < count; i += 1) {
        shrineParticleList.push(
          cx + (Math.random() - 0.5) * w,
          cy + (Math.random() - 0.5) * h,
          cz + (Math.random() - 0.5) * d,
        );
      }
    }
    function addConeParticles(count, radius, height, cx, cy, cz) {
      for (let i = 0; i < count; i += 1) {
        const y = Math.random() * height;
        const t = y / height;
        const r = (1 - t) * radius * (0.6 + Math.random() * 0.4);
        const a = Math.random() * Math.PI * 2;
        shrineParticleList.push(
          cx + Math.cos(a) * r,
          cy + y - height * 0.5,
          cz + Math.sin(a) * r,
        );
      }
    }

    addBoxParticles(1800, 52, 4, 52, 0, 2, 0);
    addBoxParticles(1500, 36, 8, 36, 0, 8, 0);
    addBoxParticles(1300, 22, 13, 22, 0, 18, 0);
    addConeParticles(1000, 30, 8, 0, 14, 0);
    addConeParticles(900, 20, 6, 0, 28, 0);
    addBoxParticles(320, 2.8, 16, 2.8, -21, 8, 18);
    addBoxParticles(320, 2.8, 16, 2.8, 21, 8, 18);
    addBoxParticles(420, 48, 2.4, 3.2, 0, 15.2, 18);
    addBoxParticles(460, 56, 2.1, 4, 0, 18, 18);

    const shrineParticleGeo = new THREE.BufferGeometry();
    shrineParticleGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(shrineParticleList), 3),
    );
    const shrineParticleMat = new THREE.PointsMaterial({
      color: 0xff2a2a,
      size: 0.78,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shrineParticlePoints = new THREE.Points(shrineParticleGeo, shrineParticleMat);
    shrineParticlePoints.position.z = SHRINE_WORLD_Z;
    shrineParticlePoints.visible = false;
    scene.add(shrineParticlePoints);

    // Dark reflective floor base.
    const shrineFloorBase = new THREE.Mesh(
      new THREE.PlaneGeometry(360, 360),
      new THREE.MeshStandardMaterial({
        color: 0x050000,
        roughness: 0.08,
        metalness: 0.88,
      }),
    );
    shrineFloorBase.rotation.x = -Math.PI / 2;
    shrineFloorBase.position.z = SHRINE_WORLD_Z;
    shrineFloorBase.visible = false;
    scene.add(shrineFloorBase);

    // Particle cursed-energy ripples layered above the reflective floor.
    // Multiple short-lived rings spawn at center and expand outward continuously.
    const SHRINE_FLOOR_RIPPLE_COUNT = 18;
    const SHRINE_FLOOR_RIPPLE_PARTICLES = 760;
    const shrineFloorRipples = [];
    const shrineFloorRippleLife = new Float32Array(SHRINE_FLOOR_RIPPLE_COUNT);
    const shrineFloorRippleLifeMax = new Float32Array(SHRINE_FLOOR_RIPPLE_COUNT);
    const shrineFloorRippleSpin = new Float32Array(SHRINE_FLOOR_RIPPLE_COUNT);
    const shrineFloorRippleMinRadius = new Float32Array(SHRINE_FLOOR_RIPPLE_COUNT);
    const shrineFloorRippleMaxRadius = new Float32Array(SHRINE_FLOOR_RIPPLE_COUNT);
    const shrineFloorRippleBand = new Float32Array(SHRINE_FLOOR_RIPPLE_COUNT);

    function resetFloorRipple(i, phase = 0) {
      const maxLife = 70 + Math.random() * 75;
      shrineFloorRippleLifeMax[i] = maxLife;
      shrineFloorRippleLife[i] = maxLife * phase;
      shrineFloorRippleSpin[i] = (Math.random() > 0.5 ? 1 : -1) * (0.002 + Math.random() * 0.006);
      shrineFloorRippleMinRadius[i] = 1 + Math.random() * 4;
      shrineFloorRippleMaxRadius[i] = 120 + Math.random() * 72;
      shrineFloorRippleBand[i] = 2.2 + Math.random() * 2.8;
    }

    for (let i = 0; i < SHRINE_FLOOR_RIPPLE_COUNT; i += 1) {
      const ripplePos = new Float32Array(SHRINE_FLOOR_RIPPLE_PARTICLES * 3);
      const rippleCol = new Float32Array(SHRINE_FLOOR_RIPPLE_PARTICLES * 3);
      const rippleAngles = new Float32Array(SHRINE_FLOOR_RIPPLE_PARTICLES);
      const rippleOffsets = new Float32Array(SHRINE_FLOOR_RIPPLE_PARTICLES);
      const rippleYNoise = new Float32Array(SHRINE_FLOOR_RIPPLE_PARTICLES);
      const hot = new THREE.Color(0xff2b2b);
      const pale = new THREE.Color(0xffd9cf);
      for (let j = 0; j < SHRINE_FLOOR_RIPPLE_PARTICLES; j += 1) {
        const p = j * 3;
        const a = (j / SHRINE_FLOOR_RIPPLE_PARTICLES) * Math.PI * 2 + (Math.random() - 0.5) * 0.035;
        rippleAngles[j] = a;
        rippleOffsets[j] = (Math.random() - 0.5) * 2;
        rippleYNoise[j] = (Math.random() - 0.5) * 0.25;
        ripplePos[p] = Math.cos(a) * 2;
        ripplePos[p + 1] = rippleYNoise[j] * 0.1;
        ripplePos[p + 2] = Math.sin(a) * 2;
        const t = ((j + i * 13) % 20) / 19;
        const c = hot.clone().lerp(pale, t > 0.62 ? 0.75 : 0.25);
        rippleCol[p] = c.r;
        rippleCol[p + 1] = c.g;
        rippleCol[p + 2] = c.b;
      }
      const rippleGeo = new THREE.BufferGeometry();
      rippleGeo.setAttribute("position", new THREE.BufferAttribute(ripplePos, 3));
      rippleGeo.setAttribute("color", new THREE.BufferAttribute(rippleCol, 3));
      const ripple = new THREE.Points(
        rippleGeo,
        new THREE.PointsMaterial({
          vertexColors: true,
          size: 1.05,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      // Keep ripple rings horizontal on ground (XZ), slightly above floor to avoid z-fighting.
      ripple.position.set(0, 0.018 + i * 0.0015, SHRINE_WORLD_Z);
      ripple.visible = false;
      ripple.userData.angles = rippleAngles;
      ripple.userData.offsets = rippleOffsets;
      ripple.userData.yNoise = rippleYNoise;
      ripple.userData.positions = ripplePos;
      shrineFloorRipples.push(ripple);
      resetFloorRipple(i, i / SHRINE_FLOOR_RIPPLE_COUNT);
      scene.add(ripple);
    }

    const SHRINE_BASE_SCALE = 1.45;
    const SHRINE_SLASH_COUNT = 1200;
    const shrineSlashGeo = new THREE.BufferGeometry();
    const shrineSlashPos = new Float32Array(SHRINE_SLASH_COUNT * 6);
    const shrineSlashColors = new Float32Array(SHRINE_SLASH_COUNT * 6);
    const shrineSlashVel = new Float32Array(SHRINE_SLASH_COUNT * 3);
    const shrineSlashLen = new Float32Array(SHRINE_SLASH_COUNT);
    const shrineSlashLife = new Float32Array(SHRINE_SLASH_COUNT);
    const shrineSlashLifeMax = new Float32Array(SHRINE_SLASH_COUNT);
    const shrineSlashHeadColor = new THREE.Color();
    const shrineSlashTailColor = new THREE.Color();
    const shrineSlashMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 2,
    });
    const shrineSlashLines = new THREE.LineSegments(shrineSlashGeo, shrineSlashMat);
    shrineSlashLines.visible = false;
    scene.add(shrineSlashLines);

    const slashBladeGeo = new THREE.ConeGeometry(0.2, 2.4, 4);
    const slashBladeMat = new THREE.MeshBasicMaterial({
      color: 0xffdada,
      transparent: true,
      opacity: 0.78,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shrineSlashBlades = new THREE.InstancedMesh(
      slashBladeGeo,
      slashBladeMat,
      SHRINE_SLASH_COUNT,
    );
    shrineSlashBlades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shrineSlashBlades.visible = false;
    scene.add(shrineSlashBlades);
    const slashUp = new THREE.Vector3(0, 1, 0);
    const slashDir = new THREE.Vector3();
    const slashPosV = new THREE.Vector3();
    const slashQuat = new THREE.Quaternion();
    const slashScale = new THREE.Vector3();
    const slashMatrix = new THREE.Matrix4();
    const shrineCamBasePos = new THREE.Vector3(0, 30, 80);
    const shrineCamTarget = new THREE.Vector3(0, 10, SHRINE_WORLD_Z);
    const shrineCamBaseQuat = new THREE.Quaternion();
    const SHRINE_VIEW_YAW = Math.PI * 0.25;

    function generateShrineSlash(index) {
      const p = index * 6;
      const v = index * 3;
      const centerZ = SHRINE_WORLD_Z;
      let x;
      let y;
      let z;
      let dirX;
      let dirY;
      let dirZ;
      const mode = Math.random();
      const angle = Math.random() * Math.PI * 2;

      if (mode < 0.12) {
        // Strong vertical slashes (upward/downward) with slight drift.
        const radius = 14 + Math.random() * 122;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius + centerZ;
        const upward = Math.random() > 0.5;
        y = upward ? (-8 + Math.random() * 12) : (58 + Math.random() * 24);
        dirX = (Math.random() - 0.5) * 0.24;
        dirY = upward ? (0.75 + Math.random() * 0.6) : -(0.75 + Math.random() * 0.6);
        dirZ = (Math.random() - 0.5) * 0.24;
      } else if (mode < 0.92) {
        // Mostly diagonal slashes with varying pitch and heading.
        const radius = 45 + Math.random() * 130;
        x = Math.cos(angle) * radius;
        z = Math.sin(angle) * radius + centerZ;
        y = 2 + Math.random() * 58;
        const tilt = Math.random() * 1.9 - 0.95;
        const inwardWeight = 0.45 + Math.random() * 0.95;
        const cross = (Math.random() - 0.5) * 1.1;
        dirX =
          -Math.cos(angle) * inwardWeight +
          -Math.sin(angle) * cross +
          (Math.random() - 0.5) * 0.36;
        dirY = tilt;
        dirZ =
          -Math.sin(angle) * inwardWeight +
          Math.cos(angle) * cross +
          (Math.random() - 0.5) * 0.36;
      } else {
        // Omnidirectional burst slashes.
        const radius = 10 + Math.random() * 36;
        x = (Math.random() - 0.5) * radius * 2;
        y = 8 + Math.random() * 32;
        z = (Math.random() - 0.5) * radius * 2 + centerZ;
        dirX = (Math.random() - 0.5) * 2;
        dirY = (Math.random() - 0.5) * 2;
        dirZ = (Math.random() - 0.5) * 2;
      }

      const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
      dirX /= dirLen;
      dirY /= dirLen;
      dirZ /= dirLen;

      const speed = 1 + Math.random() * 2.4;
      const length = 16 + Math.random() * 34;
      shrineSlashVel[v] = dirX * speed;
      shrineSlashVel[v + 1] = dirY * speed;
      shrineSlashVel[v + 2] = dirZ * speed;
      shrineSlashLen[index] = length;
      shrineSlashLifeMax[index] = 45 + Math.random() * 70;
      shrineSlashLife[index] = shrineSlashLifeMax[index];

      shrineSlashPos[p] = x;
      shrineSlashPos[p + 1] = y;
      shrineSlashPos[p + 2] = z;
      shrineSlashPos[p + 3] = x - dirX * length;
      shrineSlashPos[p + 4] = y - dirY * length;
      shrineSlashPos[p + 5] = z - dirZ * length;

      shrineSlashHeadColor.setHSL(0.0, 0, 1);
      shrineSlashTailColor.setHSL(0.0, 0.95, 0.38);
      shrineSlashColors[p] = shrineSlashHeadColor.r;
      shrineSlashColors[p + 1] = shrineSlashHeadColor.g;
      shrineSlashColors[p + 2] = shrineSlashHeadColor.b;
      shrineSlashColors[p + 3] = shrineSlashTailColor.r;
      shrineSlashColors[p + 4] = shrineSlashTailColor.g;
      shrineSlashColors[p + 5] = shrineSlashTailColor.b;
    }
    for (let i = 0; i < SHRINE_SLASH_COUNT; i += 1) generateShrineSlash(i);
    shrineSlashGeo.setAttribute("position", new THREE.BufferAttribute(shrineSlashPos, 3));
    shrineSlashGeo.setAttribute("color", new THREE.BufferAttribute(shrineSlashColors, 3));

    const CORE_PARTICLES = 2000;
    const shrineCoreGeo = new THREE.BufferGeometry();
    const shrineCorePos = new Float32Array(CORE_PARTICLES * 3);
    for (let i = 0; i < CORE_PARTICLES * 3; i += 3) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2 * Math.PI;
      const phi = Math.acos(2 * v - 1);
      const r = Math.cbrt(Math.random()) * 12;
      shrineCorePos[i] = r * Math.sin(phi) * Math.cos(theta);
      shrineCorePos[i + 1] = r * Math.sin(phi) * Math.sin(theta);
      shrineCorePos[i + 2] = r * Math.cos(phi);
    }
    shrineCoreGeo.setAttribute("position", new THREE.BufferAttribute(shrineCorePos, 3));
    const shrineCoreMat = new THREE.PointsMaterial({
      color: 0xff0000,
      size: 0.5,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const shrineCorePoints = new THREE.Points(shrineCoreGeo, shrineCoreMat);
    shrineCorePoints.position.y = 15;
    shrineCorePoints.position.z = SHRINE_WORLD_Z;
    shrineCorePoints.visible = false;
    scene.add(shrineCorePoints);

    // --- Reversal: Red Configuration ---
    const RED_CORE_PARTICLES = 5200;
    const RED_CORE_RADIUS = 30;
    const redCoreGeo = new THREE.BufferGeometry();
    const redCorePos = new Float32Array(RED_CORE_PARTICLES * 3);
    const redCoreSpeed = new Float32Array(RED_CORE_PARTICLES);

    function respawnRedCoreParticle(index, outerShell = false) {
      const p = index * 3;
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1;
      const shell = Math.sqrt(1 - u * u);
      const radius = outerShell
        ? RED_CORE_RADIUS * (0.52 + Math.random() * 0.24)
        : RED_CORE_RADIUS * Math.pow(Math.random(), 4.2);
      redCorePos[p] = Math.cos(theta) * shell * radius;
      redCorePos[p + 1] = u * radius;
      redCorePos[p + 2] = Math.sin(theta) * shell * radius;
      redCoreSpeed[index] = 0.05 + Math.random() * 0.2;
    }

    for (let i = 0; i < RED_CORE_PARTICLES; i += 1) {
      respawnRedCoreParticle(i);
    }

    const redParticleCanvas = document.createElement("canvas");
    redParticleCanvas.width = 128;
    redParticleCanvas.height = 128;
    const redParticleCtx = redParticleCanvas.getContext("2d");
    const redParticleGrad = redParticleCtx.createRadialGradient(64, 64, 0, 64, 64, 64);
    redParticleGrad.addColorStop(0, "rgba(255,255,255,1)");
    redParticleGrad.addColorStop(0.42, "rgba(255,255,255,0.95)");
    redParticleGrad.addColorStop(1, "rgba(255,255,255,0)");
    redParticleCtx.fillStyle = redParticleGrad;
    redParticleCtx.fillRect(0, 0, 128, 128);
    const redParticleMap = new THREE.CanvasTexture(redParticleCanvas);
    redParticleMap.minFilter = THREE.LinearFilter;
    redParticleMap.magFilter = THREE.LinearFilter;

    redCoreGeo.setAttribute("position", new THREE.BufferAttribute(redCorePos, 3));
    const redCoreMat = new THREE.PointsMaterial({
      color: 0xff6a6a,
      map: redParticleMap,
      alphaTest: 0.06,
      size: 1.12,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const redCorePoints = new THREE.Points(redCoreGeo, redCoreMat);
    redCorePoints.visible = false;
    scene.add(redCorePoints);

    const RED_REVERB_RING_COUNT = 10;
    const RED_REVERB_RING_SEGMENTS = 5200;
    const RED_REVERB_INTERVAL = 0.045;
    const RED_REVERB_DURATION = 0.22;
    const RED_REVERB_LAYER_SHRINK = 0.045;
    const redReverbRings = [];
    const redReverbLife = new Float32Array(RED_REVERB_RING_COUNT);
    const redReverbLifeMax = new Float32Array(RED_REVERB_RING_COUNT);
    const redReverbDirection = new Float32Array(RED_REVERB_RING_COUNT);
    const redReverbAxis = new THREE.Vector3(Math.SQRT1_2, 0, -Math.SQRT1_2); // 45 deg to camera view axis
    const redRingUp = new THREE.Vector3(0, 1, 0);
    const redRingQuat = new THREE.Quaternion();
    redRingQuat.setFromUnitVectors(redRingUp, redReverbAxis);

    const redRingPos = new Float32Array(RED_REVERB_RING_SEGMENTS * 3);
    const redRingCol = new Float32Array(RED_REVERB_RING_SEGMENTS * 3);
    const redRingHot = new THREE.Color(0xff8d8d);
    const redRingCold = new THREE.Color(0xff5f5f);
    const redRingBlend = new THREE.Color();
    for (let i = 0; i < RED_REVERB_RING_SEGMENTS; i += 1) {
      const p = i * 3;
      const a = (i / RED_REVERB_RING_SEGMENTS) * Math.PI * 2;
      const band = 1 + (Math.random() - 0.5) * 0.08;
      redRingPos[p] = Math.cos(a) * band;
      redRingPos[p + 1] = (Math.random() - 0.5) * 0.03;
      redRingPos[p + 2] = Math.sin(a) * band;
      const glowMix = 0.55 + Math.random() * 0.45;
      redRingBlend.copy(redRingCold).lerp(redRingHot, glowMix);
      redRingCol[p] = redRingBlend.r;
      redRingCol[p + 1] = redRingBlend.g;
      redRingCol[p + 2] = redRingBlend.b;
    }
    const redUnitRingGeo = new THREE.BufferGeometry();
    redUnitRingGeo.setAttribute("position", new THREE.BufferAttribute(redRingPos, 3));
    redUnitRingGeo.setAttribute("color", new THREE.BufferAttribute(redRingCol, 3));

    function resetRedReverbRing(index, phase = 0) {
      redReverbLifeMax[index] = RED_REVERB_DURATION;
      redReverbLife[index] = RED_REVERB_DURATION * phase;
      redReverbDirection[index] = index % 2 === 0 ? 1 : -1;

      const ring = redReverbRings[index];
      ring.quaternion.copy(redRingQuat);
      ring.position.set(0, 0, 0);
      ring.scale.setScalar(RED_CORE_RADIUS * (1.04 - index * RED_REVERB_LAYER_SHRINK * 0.3));
      ring.material.opacity = 0;
    }

    for (let i = 0; i < RED_REVERB_RING_COUNT; i += 1) {
      const ring = new THREE.Points(
        redUnitRingGeo,
        new THREE.PointsMaterial({
          vertexColors: true,
          map: redParticleMap,
          alphaTest: 0.03,
          size: 1.7,
          sizeAttenuation: false,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      ring.visible = false;
      scene.add(ring);
      redReverbRings.push(ring);
      resetRedReverbRing(i, i / RED_REVERB_RING_COUNT);
    }

    const RED_CONTRAIL_COUNT = 540;
    const RED_CONTRAIL_ARMS = 7;
    const RED_CONTRAIL_TIGHTNESS = 0.14;
    const RED_CONTRAIL_MAX_RADIUS = 360;
    const RED_SPIRAL_TILT_X = -Math.PI * 0.25;
    const RED_SPIRAL_TILT_Z = Math.PI * 0.08;
    const redContrailGeo = new THREE.BufferGeometry();
    const redContrailPos = new Float32Array(RED_CONTRAIL_COUNT * 6);
    const redContrailCol = new Float32Array(RED_CONTRAIL_COUNT * 6);
    const redContrailArm = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailSpin = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailRadius = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailTheta = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailY = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailRadialSpeed = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailAngularSpeed = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailYSpeed = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailLength = new Float32Array(RED_CONTRAIL_COUNT);
    const redContrailPhase = new Float32Array(RED_CONTRAIL_COUNT);

    function writeRedContrail(index, t = 0, energy = 0) {
      const p = index * 6;
      const radius = redContrailRadius[index];
      const tailRadius = Math.max(0.3, radius - redContrailLength[index]);
      const spin = redContrailSpin[index];
      const armBase = (redContrailArm[index] / RED_CONTRAIL_ARMS) * Math.PI * 2;
      const spinPhase = t * redContrailAngularSpeed[index] * (0.9 + energy * 2.8) * spin + redContrailPhase[index];
      const headTheta = armBase + redContrailTheta[index] + radius * RED_CONTRAIL_TIGHTNESS * spin + spinPhase;
      const tailTheta = armBase + redContrailTheta[index] + tailRadius * RED_CONTRAIL_TIGHTNESS * spin + spinPhase;
      const headY = redContrailY[index] + Math.sin(radius * 0.06 + spinPhase * 1.35) * 0.95;
      const tailY = redContrailY[index] + Math.sin(tailRadius * 0.06 + spinPhase * 1.35) * 0.95;
      const fade = Math.max(0, 1 - radius / RED_CONTRAIL_MAX_RADIUS);
      const headGlow = 0.22 + fade * 0.78;
      const tailGlow = headGlow * 0.14;

      redContrailPos[p] = Math.cos(headTheta) * radius;
      redContrailPos[p + 1] = headY;
      redContrailPos[p + 2] = Math.sin(headTheta) * radius;
      redContrailPos[p + 3] = Math.cos(tailTheta) * tailRadius;
      redContrailPos[p + 4] = tailY;
      redContrailPos[p + 5] = Math.sin(tailTheta) * tailRadius;

      redContrailCol[p] = headGlow;
      redContrailCol[p + 1] = 0;
      redContrailCol[p + 2] = 0;
      redContrailCol[p + 3] = tailGlow;
      redContrailCol[p + 4] = 0;
      redContrailCol[p + 5] = 0;
    }

    function resetRedContrail(index, seeded = false) {
      redContrailArm[index] = Math.floor(Math.random() * RED_CONTRAIL_ARMS);
      redContrailSpin[index] = Math.random() > 0.5 ? 1 : -1;
      redContrailRadius[index] = seeded ? Math.random() * RED_CONTRAIL_MAX_RADIUS * 0.46 : 0.05 + Math.random() * 1.4;
      redContrailTheta[index] = (Math.random() - 0.5) * 0.24;
      redContrailY[index] = (Math.random() * 2 - 1) * 2.8;
      redContrailRadialSpeed[index] = 1.9 + Math.random() * 3.8;
      redContrailAngularSpeed[index] = 0.7 + Math.random() * 1.2;
      redContrailYSpeed[index] = (Math.random() * 2 - 1) * 0.06;
      redContrailLength[index] = 13 + Math.random() * 24;
      redContrailPhase[index] = Math.random() * Math.PI * 2;
      writeRedContrail(index, 0, 0);
    }

    for (let i = 0; i < RED_CONTRAIL_COUNT; i += 1) {
      resetRedContrail(i, true);
    }

    redContrailGeo.setAttribute("position", new THREE.BufferAttribute(redContrailPos, 3));
    redContrailGeo.setAttribute("color", new THREE.BufferAttribute(redContrailCol, 3));
    const redContrailMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      linewidth: 1,
    });
    const redContrailLines = new THREE.LineSegments(redContrailGeo, redContrailMat);
    redContrailLines.visible = false;
    scene.add(redContrailLines);

    const RED_BURST_PARTICLES = 2800;
    const RED_BURST_MAX_RADIUS = 320;
    const redBurstGeo = new THREE.BufferGeometry();
    const redBurstPos = new Float32Array(RED_BURST_PARTICLES * 3);
    const redBurstVel = new Float32Array(RED_BURST_PARTICLES * 3);
    const redBurstCol = new Float32Array(RED_BURST_PARTICLES * 3);
    const redBurstAlpha = new Float32Array(RED_BURST_PARTICLES);
    const redBurstSize = new Float32Array(RED_BURST_PARTICLES);
    const redBurstBaseSize = new Float32Array(RED_BURST_PARTICLES);
    const redBurstLife = new Float32Array(RED_BURST_PARTICLES);
    const redBurstLifeMax = new Float32Array(RED_BURST_PARTICLES);

    function resetRedBurstParticle(index, seeded = false) {
      const p = index * 3;
      const u = Math.random() * 2 - 1;
      const theta = Math.random() * Math.PI * 2;
      const shell = Math.sqrt(1 - u * u);
      const dirX = Math.cos(theta) * shell;
      const dirY = u * 0.55;
      const dirZ = Math.sin(theta) * shell;
      const spawnRadius = seeded ? Math.random() * RED_BURST_MAX_RADIUS * 0.16 : Math.random() * 1.2;
      const speed = 1.7 + Math.random() * 4.6;
      const jitter = (Math.random() * 2 - 1) * 0.35;

      redBurstPos[p] = dirX * spawnRadius;
      redBurstPos[p + 1] = dirY * spawnRadius * 0.42;
      redBurstPos[p + 2] = dirZ * spawnRadius;
      redBurstVel[p] = dirX * speed + jitter;
      redBurstVel[p + 1] = dirY * speed * 0.5;
      redBurstVel[p + 2] = dirZ * speed + jitter;
      redBurstLifeMax[index] = 32 + Math.random() * 58;
      redBurstLife[index] = seeded ? Math.random() * redBurstLifeMax[index] : redBurstLifeMax[index];
      redBurstBaseSize[index] = 0.7 + Math.random() * 2.0;
      redBurstAlpha[index] = 1;
      redBurstSize[index] = redBurstBaseSize[index];

      redBurstCol[p] = 1;
      redBurstCol[p + 1] = 0.1 + Math.random() * 0.12;
      redBurstCol[p + 2] = 0.02 + Math.random() * 0.05;
    }

    for (let i = 0; i < RED_BURST_PARTICLES; i += 1) {
      resetRedBurstParticle(i, true);
    }

    redBurstGeo.setAttribute("position", new THREE.BufferAttribute(redBurstPos, 3));
    redBurstGeo.setAttribute("color", new THREE.BufferAttribute(redBurstCol, 3));
    redBurstGeo.setAttribute("aSize", new THREE.BufferAttribute(redBurstSize, 1));
    redBurstGeo.setAttribute("aAlpha", new THREE.BufferAttribute(redBurstAlpha, 1));
    const redBurstMat = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: 1 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aAlpha;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float sizeScale = 210.0 / max(1.0, -mvPosition.z);
          gl_PointSize = min(16.0, max(0.4, aSize * sizeScale));
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float dist = length(centered);
          float mask = 1.0 - smoothstep(0.35, 0.5, dist);
          gl_FragColor = vec4(vColor, vAlpha * mask * uOpacity);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
    });
    const redBurstPoints = new THREE.Points(redBurstGeo, redBurstMat);
    redBurstPoints.visible = false;
    scene.add(redBurstPoints);

    const redCoreLight = new THREE.PointLight(0xff7a7a, 6.2, 360);
    redCoreLight.visible = false;
    scene.add(redCoreLight);

    function enterInfiniteVoid() {
      if (orbitControls) orbitControls.enabled = false;
      stars.visible = true;
      radialGlow.visible = true;
      ringMesh.visible = true;
    }

    function updateInfiniteVoid(t) {
      // 1. Existing Speed/Opacity Logic
      starMaterial.opacity = detectMix * 0.9;
      ringMaterial.opacity = detectMix * 0.72;
      // Boost star speed significantly on detection to sell the anomaly warp effect.
      const targetSpeed = detectMix * 120;
      currentSpeed += (targetSpeed - currentSpeed) * 0.05;

      // 2. Background Star Movement
      const posAttr = positions;
      for (let i = 0; i < STAR_COUNT; i++) {
        const zIdx = i * 3 + 2;
        posAttr[zIdx] += currentSpeed * speeds[i];
        if (posAttr[zIdx] > WRAP_NEAR_Z) {
          resetStar(i);
        }
        writeContrail(i, currentSpeed * 0.4);
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;

      // 3. Camera-aligned single ring rotation and breathing scale.
      ringMesh.quaternion.copy(camera3d.quaternion);
      ringMesh.rotateZ(-0.18 - detectMix * 0.45);
      ringMesh.scale.setScalar(1 + Math.sin(t * 1.8 + 1.1) * 0.05);

      // 4. Dynamic shake on the background field while keeping the black hole centered.
      const shakeEnvelope = detectMix * detectMix;
      const shake = shakeEnvelope * (0.8 + Math.sin(t * 19) * 0.4);
      stars.position.x = (Math.random() - 0.5) * shake * 2.2;
      stars.position.y = (Math.random() - 0.5) * shake * 1.6;
      camera3d.position.set(0, 0, 0);
      ringMesh.position.set(0, 0, -150);
      radialGlow.position.x = 0;
      radialGlow.position.y = 0;

      // 5. Glow and field spin.
      stars.rotation.z += 0.001 + (detectMix * 0.02);
      radialGlow.material.opacity = (0.1 + (detectMix * 0.4)) * detectMix;
    }

    function exitInfiniteVoid() {
      currentSpeed = 0;
      stars.visible = false;
      radialGlow.visible = false;
      ringMesh.visible = false;
      camera3d.position.set(0, 0, 0); // Reset camera
      stars.position.set(0, 0, 0);
      ringMesh.position.set(0, 0, -150);
      radialGlow.position.set(0, 0, -1200);
    }

    function enterShrine() {
      if (orbitControls) orbitControls.enabled = false;
      stars.visible = false;
      radialGlow.visible = false;
      ringMesh.visible = false;
      shrineAmbientLight.visible = true;
      shrineDirectionalLight.visible = true;
      shrineCoreLight.visible = true;
      shrineFillLight.visible = true;
      shrineGroup.visible = false;
      shrineParticlePoints.visible = true;
      shrineParticlePoints.rotation.set(0, SHRINE_VIEW_YAW, 0);
      shrineFloorBase.visible = true;
      for (let i = 0; i < shrineFloorRipples.length; i += 1) {
        shrineFloorRipples[i].visible = true;
        resetFloorRipple(i, i / shrineFloorRipples.length);
      }
      shrineSlashLines.visible = true;
      shrineSlashBlades.visible = true;
      shrineCorePoints.visible = true;
      renderer.setClearColor(0x000000, 1);
      scene.fog.color.setHex(0x000000);
      scene.fog.density = 0.003;
      camera3d.position.copy(shrineCamBasePos);
      camera3d.lookAt(shrineCamTarget);
      shrineCamBaseQuat.copy(camera3d.quaternion);
    }

    function updateShrine(t) {
      shrineCorePoints.rotation.y = t * 2;
      shrineCorePoints.rotation.z = Math.sin(t) * 0.2;
      shrineCoreMat.opacity = 0.45 + detectMix * 0.5;
      shrineCoreLight.intensity = (3.2 + Math.sin(t * 8) * 0.8) * (0.75 + detectMix * 0.95);
      shrineFillLight.intensity = 1.6 + detectMix * 3.2;
      shrineSlashMat.opacity = 0.35 + detectMix * 0.6;
      slashBladeMat.opacity = 0.55 + detectMix * 0.35;
      shrineParticleMat.opacity = 0.55 + detectMix * 0.4;
      shrineParticleMat.size = 0.74 + detectMix * 0.26;
      shrineParticlePoints.scale.setScalar(SHRINE_BASE_SCALE * (1 + Math.sin(t * 2.6) * 0.025));
      shrineParticlePoints.rotation.y = SHRINE_VIEW_YAW;
      const coreRippleBoost = Math.min(1.4, shrineCoreLight.intensity / 5.5);
      for (let i = 0; i < shrineFloorRipples.length; i += 1) {
        shrineFloorRippleLife[i] -= 0.6 + detectMix * 1.55 + coreRippleBoost * 0.45;
        if (shrineFloorRippleLife[i] <= 0) {
          resetFloorRipple(i, 1);
        }
        const lifeMix = shrineFloorRippleLife[i] / shrineFloorRippleLifeMax[i];
        const progress = 1 - lifeMix;
        const ringRadius =
          shrineFloorRippleMinRadius[i] +
          progress * (shrineFloorRippleMaxRadius[i] - shrineFloorRippleMinRadius[i]);
        const ringBand = shrineFloorRippleBand[i] * (1.3 + progress * 2.4);
        const ring = shrineFloorRipples[i];
        const positions = ring.userData.positions;
        const angles = ring.userData.angles;
        const offsets = ring.userData.offsets;
        const yNoise = ring.userData.yNoise;
        for (let j = 0; j < SHRINE_FLOOR_RIPPLE_PARTICLES; j += 1) {
          const p = j * 3;
          const r = ringRadius + offsets[j] * ringBand;
          const a = angles[j];
          positions[p] = Math.cos(a) * r;
          positions[p + 1] = yNoise[j] * 0.0015;
          positions[p + 2] = Math.sin(a) * r;
        }
        ring.geometry.attributes.position.needsUpdate = true;
        ring.position.y = 0.018 + i * 0.0015;
        ring.position.z = SHRINE_WORLD_Z;
        ring.material.opacity = (1 - progress) * (0.22 + detectMix * 0.62 + coreRippleBoost * 0.28);
        ring.material.size = 0.65 + progress * (1.05 + detectMix * 0.35 + coreRippleBoost * 0.2);
        ring.rotation.set(0, 0, 0);
      }

      // Move slash heads forward and leave trailing tails behind them.
      const travelScale = 1.45 + detectMix * 3.6;
      for (let i = 0; i < SHRINE_SLASH_COUNT; i += 1) {
        const p = i * 6;
        const v = i * 3;
        shrineSlashPos[p] += shrineSlashVel[v] * travelScale;
        shrineSlashPos[p + 1] += shrineSlashVel[v + 1] * travelScale;
        shrineSlashPos[p + 2] += shrineSlashVel[v + 2] * travelScale;

        shrineSlashLife[i] -= travelScale;
        const x = shrineSlashPos[p];
        const y = shrineSlashPos[p + 1];
        const z = shrineSlashPos[p + 2];
        if (
          shrineSlashLife[i] <= 0 ||
          Math.abs(x) > 235 ||
          Math.abs(z - SHRINE_WORLD_Z) > 235 ||
          y < -30 ||
          y > 95
        ) {
          generateShrineSlash(i);
        }

        const velLen = Math.hypot(
          shrineSlashVel[v],
          shrineSlashVel[v + 1],
          shrineSlashVel[v + 2],
        ) || 1;
        const nx = shrineSlashVel[v] / velLen;
        const ny = shrineSlashVel[v + 1] / velLen;
        const nz = shrineSlashVel[v + 2] / velLen;
        const lifeMix = shrineSlashLife[i] / shrineSlashLifeMax[i];
        const trailLength = shrineSlashLen[i] * (1.2 + (1 - lifeMix) * 1.6);
        shrineSlashPos[p + 3] = shrineSlashPos[p] - nx * trailLength;
        shrineSlashPos[p + 4] = shrineSlashPos[p + 1] - ny * trailLength;
        shrineSlashPos[p + 5] = shrineSlashPos[p + 2] - nz * trailLength;

        // Update blade instances so each slash has a thick, sharp head.
        slashDir.set(nx, ny, nz);
        slashQuat.setFromUnitVectors(slashUp, slashDir);
        slashPosV.set(shrineSlashPos[p], shrineSlashPos[p + 1], shrineSlashPos[p + 2]);
        slashPosV.addScaledVector(slashDir, 1.2);
        slashScale.set(0.28 + detectMix * 0.25, 0.95 + trailLength * 0.07, 0.18 + detectMix * 0.17);
        slashMatrix.compose(slashPosV, slashQuat, slashScale);
        shrineSlashBlades.setMatrixAt(i, slashMatrix);
      }
      shrineSlashGeo.attributes.position.needsUpdate = true;
      shrineSlashBlades.instanceMatrix.needsUpdate = true;

      // Keep camera orientation fixed (no orbital rotation), only add shake.
      const shakeAmp = 0.18 + detectMix * 2.15;
      camera3d.position.set(
        shrineCamBasePos.x + (Math.random() - 0.5) * shakeAmp,
        shrineCamBasePos.y + (Math.random() - 0.5) * shakeAmp * 0.7,
        shrineCamBasePos.z + (Math.random() - 0.5) * shakeAmp * 0.35,
      );
      camera3d.quaternion.copy(shrineCamBaseQuat);
    }

    function exitShrine() {
      if (orbitControls) orbitControls.enabled = false;
      shrineAmbientLight.visible = false;
      shrineDirectionalLight.visible = false;
      shrineCoreLight.visible = false;
      shrineFillLight.visible = false;
      shrineGroup.visible = false;
      shrineParticlePoints.visible = false;
      shrineFloorBase.visible = false;
      for (const ripple of shrineFloorRipples) {
        ripple.visible = false;
        ripple.material.opacity = 0;
        ripple.scale.set(1, 1, 1);
      }
      shrineSlashLines.visible = false;
      shrineSlashBlades.visible = false;
      shrineCorePoints.visible = false;
      renderer.setClearColor(0x010206, 1);
      scene.fog.color.setHex(0x010206);
      scene.fog.density = 0.0012;
      camera3d.position.set(0, 0, 0);
      camera3d.rotation.set(0, 0, 0);
      shrineGroup.rotation.set(0, 0, 0);
    }

    function enterRed() {
      stars.visible = false;
      radialGlow.visible = false;
      ringMesh.visible = false;
      shrineAmbientLight.visible = false;
      shrineDirectionalLight.visible = false;
      shrineCoreLight.visible = false;
      shrineFillLight.visible = false;
      shrineGroup.visible = false;
      shrineParticlePoints.visible = false;
      shrineFloorBase.visible = false;
      shrineSlashLines.visible = false;
      shrineSlashBlades.visible = false;
      shrineCorePoints.visible = false;
      for (const ripple of shrineFloorRipples) {
        ripple.visible = false;
      }

      redCorePoints.visible = true;
      redContrailLines.visible = false;
      redBurstPoints.visible = false;
      redCoreLight.visible = true;
      redContrailLines.rotation.set(0, 0, 0);
      redBurstPoints.rotation.set(0, 0, 0);
      camera3d.position.sub(redCameraShake);
      redCameraShake.set(0, 0, 0);
      for (let i = 0; i < RED_REVERB_RING_COUNT; i += 1) {
        const ring = redReverbRings[i];
        ring.visible = true;
        resetRedReverbRing(i, i / RED_REVERB_RING_COUNT);
      }
      renderer.setClearColor(0x000000, 1);
      scene.fog.color.setHex(0x140000);
      scene.fog.density = 0.0024;
      camera3d.position.set(0, 8, 180);
      camera3d.lookAt(0, 0, 0);
      redCoreLight.position.set(0, 0, 0);

      if (orbitControls) {
        orbitControls.enabled = true;
        orbitControls.target.set(0, 0, 0);
        orbitControls.update();
      }
    }

    function updateRed(t) {
      const pullStrength = 0.44 + detectMix * 1.82;
      for (let i = 0; i < RED_CORE_PARTICLES; i += 1) {
        const p = i * 3;
        const x = redCorePos[p];
        const y = redCorePos[p + 1];
        const z = redCorePos[p + 2];
        const radius = Math.hypot(x, y, z) || 1e-6;

        if (radius < 0.45) {
          respawnRedCoreParticle(i, true);
          continue;
        }

        const inwardStep = redCoreSpeed[i] * pullStrength * (0.2 + radius / RED_CORE_RADIUS);
        const invRadius = 1 / radius;
        redCorePos[p] = x - x * invRadius * inwardStep + (Math.random() - 0.5) * 0.002;
        redCorePos[p + 1] = y - y * invRadius * inwardStep + (Math.random() - 0.5) * 0.002;
        redCorePos[p + 2] = z - z * invRadius * inwardStep + (Math.random() - 0.5) * 0.002;

        if (radius > RED_CORE_RADIUS * 1.04) {
          respawnRedCoreParticle(i, true);
        }
      }
      redCoreGeo.attributes.position.needsUpdate = true;
      redCoreMat.opacity = 0.86 + detectMix * 0.14;
      redCoreMat.size = 0.82 + detectMix * 1.05;
      const coreScale = 0.98 + detectMix * 0.18;
      redCorePoints.scale.setScalar(coreScale);
      redCorePoints.rotation.x = 0;
      redCorePoints.rotation.y = t * (0.006 + detectMix * 0.009);
      redCorePoints.rotation.z = Math.sin(t * 0.8) * 0.04;

      const ringCycle = RED_REVERB_RING_COUNT * RED_REVERB_INTERVAL;
      const ringTime = ((t % ringCycle) + ringCycle) % ringCycle;
      for (let i = 0; i < RED_REVERB_RING_COUNT; i += 1) {
        const ring = redReverbRings[i];
        const start = i * RED_REVERB_INTERVAL;
        let age = ringTime - start;
        if (age < 0) age += ringCycle;
        if (age > RED_REVERB_DURATION) {
          ring.material.opacity = 0;
          continue;
        }

        const progress = age / RED_REVERB_DURATION;
        const layerScale = Math.max(0.56, 1 - i * RED_REVERB_LAYER_SHRINK);
        const radius = RED_CORE_RADIUS * layerScale * (1.08 + progress * (2.9 + detectMix * 2.5));
        ring.scale.setScalar(radius);
        ring.material.opacity = (1 - progress) * (0.72 + detectMix * 0.62);
        ring.material.size =
          layerScale * (1.25 + detectMix * 1.05 + progress * (1.75 + detectMix * 0.8));
        const axisTravel = redReverbDirection[i] * progress * (7 + detectMix * 18);
        ring.position.set(
          redReverbAxis.x * axisTravel,
          redReverbAxis.y * axisTravel,
          redReverbAxis.z * axisTravel,
        );
      }

      if (redBurstPoints.visible) {
        const burstPush = 0.9 + detectMix * 3.2;
        for (let i = 0; i < RED_BURST_PARTICLES; i += 1) {
          const p = i * 3;
          const x = redBurstPos[p];
          const y = redBurstPos[p + 1];
          const z = redBurstPos[p + 2];
          const dist = Math.hypot(x, y, z) || 1e-6;
          const outX = x / dist;
          const outY = y / dist;
          const outZ = z / dist;
          const expand = 0.018 + detectMix * 0.055;
          redBurstVel[p] += outX * expand;
          redBurstVel[p + 1] += outY * expand * 0.75;
          redBurstVel[p + 2] += outZ * expand;
          redBurstVel[p] *= 0.992;
          redBurstVel[p + 1] *= 0.985;
          redBurstVel[p + 2] *= 0.992;

          redBurstPos[p] += redBurstVel[p] * burstPush;
          redBurstPos[p + 1] += redBurstVel[p + 1] * burstPush * 0.45;
          redBurstPos[p + 2] += redBurstVel[p + 2] * burstPush;

          redBurstLife[i] -= 0.7 + detectMix * 1.35;
          const newDist = Math.hypot(redBurstPos[p], redBurstPos[p + 1], redBurstPos[p + 2]);
          if (redBurstLife[i] <= 0 || newDist >= RED_BURST_MAX_RADIUS) {
            resetRedBurstParticle(i);
            continue;
          }

          const lifeMix = redBurstLife[i] / redBurstLifeMax[i];
          const distFade = Math.max(0, 1 - newDist / RED_BURST_MAX_RADIUS);
          const alpha = lifeMix * distFade;
          redBurstAlpha[i] = alpha;
          redBurstSize[i] = redBurstBaseSize[i] * (0.35 + alpha * 0.8);
        }
        redBurstGeo.attributes.position.needsUpdate = true;
        redBurstGeo.attributes.aAlpha.needsUpdate = true;
        redBurstGeo.attributes.aSize.needsUpdate = true;
        redBurstMat.uniforms.uOpacity.value = 0.2 + detectMix * 0.55;
      }
      redBurstPoints.rotation.set(0, 0, 0);

      redCoreLight.intensity = (3.5 + Math.sin(t * 10.2) * 0.5) * (0.8 + detectMix * 3.4);
      camera3d.position.sub(redCameraShake);

      if (orbitControls && orbitControls.enabled) {
        orbitControls.update();
      }
      const shake = 0.18 + detectMix * 1.65;
      redCameraShake.set(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake * 0.68,
        (Math.random() - 0.5) * shake * 0.4,
      );
      camera3d.position.add(redCameraShake);
    }

    function exitRed() {
      redCorePoints.visible = false;
      redCorePoints.scale.set(1, 1, 1);
      redCorePoints.rotation.set(0, 0, 0);
      redContrailLines.visible = false;
      redBurstPoints.visible = false;
      redCoreLight.visible = false;
      redContrailLines.rotation.set(0, 0, 0);
      redBurstPoints.rotation.set(0, 0, 0);
      camera3d.position.sub(redCameraShake);
      redCameraShake.set(0, 0, 0);
      for (const ring of redReverbRings) {
        ring.visible = false;
        ring.material.opacity = 0;
        ring.scale.setScalar(RED_CORE_RADIUS * 1.12);
        ring.position.set(0, 0, 0);
      }
      renderer.setClearColor(0x010206, 1);
      scene.fog.color.setHex(0x010206);
      scene.fog.density = 0.0012;
      camera3d.position.set(0, 0, 0);
      camera3d.rotation.set(0, 0, 0);
      if (orbitControls) {
        orbitControls.enabled = false;
      }
    }

    const backgroundAnimations = {
      infinite_void: { enter: enterInfiniteVoid, update: updateInfiniteVoid, exit: exitInfiniteVoid },
      shrine: { enter: enterShrine, update: updateShrine, exit: exitShrine },
      red: { enter: enterRed, update: updateRed, exit: exitRed },
      mahoraga: { enter: () => {}, update: () => {}, exit: () => {} },
    };

    function setSign(signName) {
      const nextSign = signName && backgroundAnimations[signName] ? signName : null;
      if (signTransitionActive) {
        // Keep latest requested sign while transition is in flight.
        pendingSign = nextSign;
        // If request flips back to current during gather, cancel transition and stay.
        if (signTransitionPhase === 0 && nextSign === activeSign) {
          signTransitionActive = false;
          signTransitionPoints.visible = false;
          signTransitionMat.opacity = 0;
          pendingSign = null;
          detectTarget = activeSign ? 1 : 0;
        }
        return;
      }

      if (nextSign === activeSign) {
        detectTarget = activeSign ? 1 : 0;
        return;
      }

      if (!activeSign) {
        activeSign = nextSign;
        if (activeSign) {
          backgroundAnimations[activeSign].enter();
          detectTarget = 1;
        } else {
          detectTarget = 0;
        }
        return;
      }

      // Current scene consolidates, then next scene forms from transition particles.
      startSignTransition(nextSign);
      detectTarget = 1;
    }

    function onResize() {
      camera3d.aspect = window.innerWidth / window.innerHeight;
      camera3d.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      detectMix += (detectTarget - detectMix) * 0.06;

      if (signTransitionActive) {
        if (activeSign) {
          backgroundAnimations[activeSign].update(t);
        }
        updateSignTransition();
        renderer.render(scene, camera3d);
        return;
      }

      if (detectMix > 0.001 && activeSign) {
        backgroundAnimations[activeSign].update(t);
        renderer.render(scene, camera3d);
      } else {
        renderer.clear();
      }
    }

    animate();
    return { setSign };
  }




  

  async function main() {
    const statusEl = document.getElementById("status");
    function setStatus(text) {
      statusEl.textContent = "Status: " + text;
    }

    let bg;
    try {
      bg = initBackground();
    } catch (err) {
      console.error("Three.js init failed:", err);
      setStatus("3D failed (see console)");
      return;
    }

    const video = document.getElementById("video");
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");

    // Map model output index -> sign label. Keep this order aligned with training.
    const CLASS_LABELS = ["infinite_void", "shrine", "red", "mahoraga"];
    // Signs that currently drive a full background animation.
    const ANIMATED_SIGNS = new Set(["infinite_void", "shrine", "red"]);
    const CONF_THRESHOLD = 0.9;
    const REQUIRED_STREAK = 4;
    // Per-class leniency: Infinite Void can pass with lower confidence/fewer consecutive frames.
    const CLASS_CONF_THRESHOLD = {
      infinite_void: 0.8,
    };
    const CLASS_REQUIRED_STREAK = {
      infinite_void: 3,
    };
    let streak = 0;
    let streakLabel = null;
    let activeLabel = null;

    // Single bridge from ML prediction layer to background system.
    function setDetectionState(label) {
      if (activeLabel === label) {
        return;
      }
      activeLabel = label;
      bg.setSign(label && ANIMATED_SIGNS.has(label) ? label : null);
    }

    // Normalize hand landmarks around wrist and hand scale for model invariance.
    function normalizeHand(landmarks) {
      const wrist = landmarks[0];
      const midTip = landmarks[12];
      const scale =
        Math.hypot(midTip.x - wrist.x, midTip.y - wrist.y, midTip.z - wrist.z) ||
        1e-6;

      const out = [];
      for (const p of landmarks) {
        out.push((p.x - wrist.x) / scale);
        out.push((p.y - wrist.y) / scale);
        out.push((p.z - wrist.z) / scale);
      }
      return out;
    }

    // Build fixed-length feature vector [left hand(63), right hand(63)].
    // Missing hands stay zeroed so tensor shape is always stable.
    function getTwoHandFeatures(results) {
      const left = new Array(63).fill(0);
      const right = new Array(63).fill(0);
      const lms = results.multiHandLandmarks || [];
      const handed = results.multiHandedness || [];

      for (let i = 0; i < lms.length; i += 1) {
        const side = handed[i] && handed[i].label;
        const f = normalizeHand(lms[i]);
        if (side === "Left") {
          for (let j = 0; j < 63; j += 1) left[j] = f[j];
        } else if (side === "Right") {
          for (let j = 0; j < 63; j += 1) right[j] = f[j];
        }
      }

      return left.concat(right);
    }

    setStatus("loading model...");
    let model;
    try {
      model = await tf.loadLayersModel("./hand-sign-model.json");
    } catch (err) {
      setStatus("model load failed (check .weights.bin file)");
      console.error("Model load failed:", err);
      return;
    }

    setStatus("model loaded, starting camera...");

    const hands = new Hands({
      locateFile: (file) => "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file,
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    // Per-frame MediaPipe callback: draw landmarks, infer class, gate with streak.
    hands.onResults((results) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
          drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
            color: "#00ff88",
            lineWidth: 2,
          });
          drawLandmarks(ctx, landmarks, {
            color: "#ff4d4d",
            lineWidth: 1,
            radius: 3,
          });
        }
      }

      if (!results.multiHandLandmarks || !results.multiHandLandmarks.length) {
        streak = 0;
        streakLabel = null;
        setDetectionState(null);
        setStatus("no hand");
        return;
      }

      const feat = getTwoHandFeatures(results);
      // Run prediction inside tidy to avoid tensor memory leaks.
      const probs = tf.tidy(() => {
        const t = tf.tensor2d([feat]);
        return Array.from(model.predict(t).dataSync());
      });
      if (!probs.length) {
        streak = 0;
        streakLabel = null;
        setDetectionState(null);
        setStatus("prediction failed");
        return;
      }

      let predictedLabel = CLASS_LABELS[0];
      let score = probs[0];

      // Supports current single-output model and future multiclass outputs.
      if (probs.length > 1) {
        let maxIdx = 0;
        for (let i = 1; i < probs.length; i += 1) {
          if (probs[i] > probs[maxIdx]) {
            maxIdx = i;
          }
        }
        predictedLabel = CLASS_LABELS[maxIdx] || "class_" + maxIdx;
        score = probs[maxIdx];
      }

      const confThreshold = CLASS_CONF_THRESHOLD[predictedLabel] ?? CONF_THRESHOLD;
      const requiredStreak = CLASS_REQUIRED_STREAK[predictedLabel] ?? REQUIRED_STREAK;

      // Debounce predictions with per-label streak to reduce flicker/noise.
      if (score >= confThreshold && predictedLabel) {
        if (streakLabel === predictedLabel) {
          streak += 1;
        } else {
          streakLabel = predictedLabel;
          streak = 1;
        }
        const reached = streak >= requiredStreak;

        if (reached && activeLabel !== predictedLabel) {
          console.log(predictedLabel);
        }

        setDetectionState(reached ? predictedLabel : null);
        if (reached) {
          setStatus(predictedLabel.toUpperCase() + " DETECTED " + score.toFixed(3));
        } else {
          setStatus(
            predictedLabel.toUpperCase() +
              " " +
              score.toFixed(3) +
              " (" +
              streak +
              "/" +
              requiredStreak +
              ")",
          );
        }
      } else {
        streak = 0;
        streakLabel = null;
        setDetectionState(null);
        setStatus("OTHER " + score.toFixed(3));
      }
    });

    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;

    video.addEventListener("loadeddata", () => {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    });

    const camera = new Camera(video, {
      onFrame: async () => {
        await hands.send({ image: video });
      },
      width: 640,
      height: 480,
    });

    await camera.start();
    setStatus("ready");
  }

  main().catch((err) => {
    console.error("App failed:", err);
    const statusEl = document.getElementById("status");
    if (statusEl) {
      statusEl.textContent = "Status: app failed (see console)";
    }
  });
})();
