(function () {
  function initBackground() {
    const bgRoot = document.getElementById("bg3d");
    if (!bgRoot) {
      throw new Error("Missing #bg3d container.");
    }
    if (!window.THREE) {
      throw new Error("Three.js was not loaded.");
    }

    const STAR_COUNT = 20000;
    const CYLINDER_RADIUS = 280;
    const CYLINDER_DEPTH = 4200;
    const WRAP_NEAR_Z = 50;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x02040a, 1);
    bgRoot.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x02040a, 0.00115);

    const camera3d = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.1,
      8000,
    );
    camera3d.position.z = 0;

    function randomCylinderPosition(out, i) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * CYLINDER_RADIUS;
      out[i] = Math.cos(angle) * radius;
      out[i + 1] = Math.sin(angle) * radius;
      out[i + 2] = -Math.random() * CYLINDER_DEPTH;
    }

    const positions = new Float32Array(STAR_COUNT * 3);
    const speeds = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const p = i * 3;
      randomCylinderPosition(positions, p);
      speeds[i] = 0.6 + Math.random() * 1.2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const stars = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.35,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    scene.add(stars);

    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = 256;
    glowCanvas.height = 256;
    const glowCtx = glowCanvas.getContext("2d");
    const glowGrad = glowCtx.createRadialGradient(128, 128, 0, 128, 128, 128);
    glowGrad.addColorStop(0, "rgba(255,255,255,1)");
    glowGrad.addColorStop(0.35, "rgba(255,255,255,0.55)");
    glowGrad.addColorStop(1, "rgba(255,255,255,0)");
    glowCtx.fillStyle = glowGrad;
    glowCtx.fillRect(0, 0, 256, 256);

    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    const radialGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTexture,
        color: 0xffffff,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    radialGlow.scale.set(850, 850, 1);
    radialGlow.position.set(0, 0, -900);
    scene.add(radialGlow);

    let detectTarget = 0;
    let detectMix = 0;
    let currentSpeed = 0;

    function setDetected(active) {
      detectTarget = active ? 1 : 0;
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

      if (detectMix < 0.01) {
        stars.visible = false;
        radialGlow.visible = false;
        renderer.clear();
        return;
      }

      stars.visible = true;
      radialGlow.visible = true;

      stars.material.opacity = 0.96 * detectMix;

      const targetSpeed = detectMix * 62;
      currentSpeed += (targetSpeed - currentSpeed) * 0.08;

      for (let i = 0; i < STAR_COUNT; i += 1) {
        const p = i * 3;
        positions[p + 2] += currentSpeed * speeds[i];

        if (positions[p + 2] > WRAP_NEAR_Z) {
          const angle = Math.random() * Math.PI * 2;
          const radius = Math.sqrt(Math.random()) * CYLINDER_RADIUS;
          positions[p] = Math.cos(angle) * radius;
          positions[p + 1] = Math.sin(angle) * radius;
          positions[p + 2] = -CYLINDER_DEPTH - Math.random() * 700;
          speeds[i] = 0.6 + Math.random() * 1.2;
        }
      }

      geometry.attributes.position.needsUpdate = true;

      const pulse = 0.06 + 0.04 * Math.sin(t * 2.1);
      radialGlow.material.opacity = (pulse + detectMix * 0.2) * detectMix;
      radialGlow.scale.setScalar(850 + detectMix * 260);

      renderer.render(scene, camera3d);
    }

    animate();
    return { setDetected };
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

    const CONF_THRESHOLD = 0.9;
    const REQUIRED_STREAK = 4;
    let streak = 0;
    let isDetected = false;

    function setDetectionState(active) {
      if (isDetected === active) {
        return;
      }
      isDetected = active;
      bg.setDetected(active);
    }

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
      model = await tf.loadLayersModel("./infinite-void-model.json");
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
        setDetectionState(false);
        setStatus("no hand");
        return;
      }

      const feat = getTwoHandFeatures(results);
      const score = tf.tidy(() => {
        const t = tf.tensor2d([feat]);
        return model.predict(t).dataSync()[0];
      });

      if (score >= CONF_THRESHOLD) {
        streak += 1;
        const reached = streak >= REQUIRED_STREAK;

        if (reached && !isDetected) {
          console.log("infinite void");
        }

        setDetectionState(reached);
        if (reached) {
          setStatus("TARGET DETECTED " + score.toFixed(3));
        } else {
          setStatus(
            "TARGET " + score.toFixed(3) + " (" + streak + "/" + REQUIRED_STREAK + ")",
          );
        }
      } else {
        streak = 0;
        setDetectionState(false);
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