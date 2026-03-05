(function () {
  async function main() {
    const statusEl = document.getElementById("status");
    function setStatus(text) {
      statusEl.textContent = "Status: " + text;
    }

    let bg;
    try {
      if (
        !window.DomainExpansionBackground ||
        typeof window.DomainExpansionBackground.initBackground !== "function"
      ) {
        throw new Error("Missing background module: background-scene.js");
      }
      bg = window.DomainExpansionBackground.initBackground();
    } catch (err) {
      console.error("Three.js init failed:", err);
      setStatus("3D failed (see console)");
      return;
    }

    const featureApi = window.DomainExpansionGestureFeatures;
    if (!featureApi || typeof featureApi.getTwoHandFeatures !== "function") {
      setStatus("feature utils missing (see console)");
      console.error("Missing gesture features module: hand-features.js");
      return;
    }
    const getTwoHandFeatures = featureApi.getTwoHandFeatures;

    const video = document.getElementById("video");
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");

    // Map model output index -> sign label. Keep this order aligned with training.
    const OTHER_LABEL = "other";
    const CLASS_LABELS = ["infinite_void", "shrine", "red", "mahoraga", OTHER_LABEL];
    const OTHER_INDEX = CLASS_LABELS.indexOf(OTHER_LABEL);
    // Signs that currently drive a full background animation.
    const ANIMATED_SIGNS = new Set(["infinite_void", "shrine", "red", "mahoraga"]);
    const CONF_THRESHOLD = 0.9;
    const REQUIRED_STREAK = 4;
    const MIN_MARGIN_TOP2 = 0.12;
    const MIN_MARGIN_OVER_OTHER = 0.08;
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
    let warnedClassCountMismatch = false;

    // Single bridge from ML prediction layer to background system.
    function setDetectionState(label) {
      if (activeLabel === label) {
        return;
      }
      activeLabel = label;
      bg.setSign(label && ANIMATED_SIGNS.has(label) ? label : null);
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
      let secondScore = 0;
      let predictedIndex = 0;

      // Supports current single-output model and future multiclass outputs.
      if (probs.length > 1) {
        let maxIdx = 0;
        let secondIdx = -1;
        for (let i = 1; i < probs.length; i += 1) {
          if (probs[i] > probs[maxIdx]) {
            secondIdx = maxIdx;
            maxIdx = i;
          } else if (secondIdx === -1 || probs[i] > probs[secondIdx]) {
            secondIdx = i;
          }
        }
        predictedIndex = maxIdx;
        predictedLabel = CLASS_LABELS[maxIdx] || "class_" + maxIdx;
        score = probs[maxIdx];
        secondScore = secondIdx >= 0 ? probs[secondIdx] : 0;
      }

      if (!warnedClassCountMismatch && probs.length !== CLASS_LABELS.length) {
        warnedClassCountMismatch = true;
        console.warn(
          "Model output class count (" +
            probs.length +
            ") does not match CLASS_LABELS (" +
            CLASS_LABELS.length +
            ").",
        );
      }

      const otherScore =
        OTHER_INDEX >= 0 && OTHER_INDEX < probs.length ? probs[OTHER_INDEX] : 0;
      const marginToSecond = score - secondScore;
      const marginToOther = score - otherScore;

      // Never animate for non-domain or ambiguous classes: clear scene immediately.
      const isOtherLike =
        predictedLabel === OTHER_LABEL ||
        predictedLabel.startsWith("class_") ||
        marginToSecond < MIN_MARGIN_TOP2 ||
        (predictedIndex !== OTHER_INDEX && marginToOther < MIN_MARGIN_OVER_OTHER);
      if (isOtherLike) {
        streak = 0;
        streakLabel = null;
        setDetectionState(null);
        setStatus("OTHER " + score.toFixed(3));
        return;
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
