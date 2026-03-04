const video = document.getElementById("video");
const statusEl = document.getElementById("status");
const tf = globalThis.tf;
const Hands = globalThis.Hands;
const Camera = globalThis.Camera;
const drawConnectors = globalThis.drawConnectors;
const drawLandmarks = globalThis.drawLandmarks;
const HAND_CONNECTIONS = globalThis.HAND_CONNECTIONS;

const CLASS_LABELS = [
  "infinite_void",
  "shrine",
  "red",
  "mahoraga",
];
const CLASS_INDEX = Object.fromEntries(CLASS_LABELS.map((name, i) => [name, i]));

let collectingClass = null; // class label string | null
let predicting = false;
let model = null;
const classCounts = Object.fromEntries(CLASS_LABELS.map((name) => [name, 0]));

const X = []; // features
const y = []; // labels: class index (0..numClasses-1)
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const classSelect = document.getElementById("classSelect");
const collectClassBtn = document.getElementById("collectClass");

function setStatus(s) { statusEl.textContent = `Status: ${s}`; }

function getClassSummary() {
  return CLASS_LABELS.map((name) => `${name}:${classCounts[name]}`).join(" | ");
}

function argMax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i += 1) {
    if (arr[i] > arr[best]) best = i;
  }
  return best;
}

if (!tf || !Hands || !Camera || !drawConnectors || !drawLandmarks || !HAND_CONNECTIONS) {
  setStatus("Missing library scripts. Reload page.");
  throw new Error("Required global libraries are not loaded.");
}

if (classSelect) {
  classSelect.innerHTML = CLASS_LABELS
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
}

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 2,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.7
});

function normalizeHand(landmarks) {
  const wrist = landmarks[0];
  const midTip = landmarks[12];
  const scale = Math.hypot(midTip.x - wrist.x, midTip.y - wrist.y, midTip.z - wrist.z) || 1e-6;
  const out = [];
  for (const p of landmarks) {
    out.push((p.x - wrist.x) / scale);
    out.push((p.y - wrist.y) / scale);
    out.push((p.z - wrist.z) / scale);
  }
  return out; // 63
}

function getTwoHandFeatures(results) {
  const left = new Array(63).fill(0);
  const right = new Array(63).fill(0);

  const lms = results.multiHandLandmarks || [];
  const handed = results.multiHandedness || [];

  for (let i = 0; i < lms.length; i++) {
    const label = handed[i]?.label; // "Left" or "Right"
    const f = normalizeHand(lms[i]);
    if (label === "Left") {
      for (let j = 0; j < 63; j++) left[j] = f[j];
    } else if (label === "Right") {
      for (let j = 0; j < 63; j++) right[j] = f[j];
    }
  }

  return left.concat(right); // 126
}


hands.onResults(async (results) => {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (results.multiHandLandmarks) {
    for (const landmarks of results.multiHandLandmarks) {
      drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: "#00FF00", lineWidth: 3 });
      drawLandmarks(ctx, landmarks, { color: "#FF0000", lineWidth: 1, radius: 3 });
    }
  }

  if (!results.multiHandLandmarks?.length) return;

  const feat = getTwoHandFeatures(results);

  if (collectingClass) {
    X.push(feat);
    y.push(CLASS_INDEX[collectingClass]);
    classCounts[collectingClass] += 1;
    setStatus(`collecting ${collectingClass}: ${classCounts[collectingClass]} | ${getClassSummary()}`);
  }

  if (predicting && model) {
    const probs = tf.tidy(() => {
      const t = tf.tensor2d([feat]);
      return Array.from(model.predict(t).dataSync());
    });
    const idx = argMax(probs);
    const label = CLASS_LABELS[idx] || `class_${idx}`;
    const conf = probs[idx] || 0;
    setStatus(`predicting: ${label} (${conf.toFixed(3)})`);
  }
});

const stream = await navigator.mediaDevices.getUserMedia({ video: true });
video.srcObject = stream;

const camera = new Camera(video, {
  onFrame: async () => { await hands.send({ image: video }); },
  width: 640,
  height: 480
});
camera.start();

if (collectClassBtn && classSelect) {
  collectClassBtn.onclick = () => {
    collectingClass = classSelect.value;
    setStatus(`collecting ${collectingClass}... | ${getClassSummary()}`);
  };
}

// Backward-compatible fallback if old buttons still exist.
const collectTargetBtn = document.getElementById("collectTarget");
const collectOtherBtn = document.getElementById("collectOther");
if (collectTargetBtn) collectTargetBtn.onclick = () => { collectingClass = CLASS_LABELS[0]; };
if (collectOtherBtn) collectOtherBtn.onclick = () => { collectingClass = "other"; };

document.getElementById("stopCollect").onclick = () => {
  collectingClass = null;
  setStatus(`collection stopped | ${getClassSummary()}`);
};

document.getElementById("train").onclick = async () => {
  if (X.length < 100) return setStatus("need more samples (>=100)");
  const MIN_PER_CLASS = 30;
  const lowClasses = CLASS_LABELS.filter((name) => classCounts[name] < MIN_PER_CLASS);
  if (lowClasses.length) {
    return setStatus(`collect >=${MIN_PER_CLASS} samples for: ${lowClasses.join(", ")}`);
  }
  setStatus("training...");

  const xs = tf.tensor2d(X); // [N,126]
  const labelTensor = tf.tensor1d(y, "int32"); // [N]
  const ys = tf.oneHot(labelTensor, CLASS_LABELS.length); // [N,C]

  if (model) model.dispose();
  model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [126], units: 128, activation: "relu" }));
  model.add(tf.layers.dense({ units: 64, activation: "relu" }));
  model.add(tf.layers.dense({ units: CLASS_LABELS.length, activation: "softmax" }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"]
  });

  await model.fit(xs, ys, {
    epochs: 20,
    batchSize: 32,
    validationSplit: 0.2,
    callbacks: { onEpochEnd: (e, logs) => setStatus(`epoch ${e+1} acc=${logs.accuracy?.toFixed(3)} val=${logs.val_accuracy?.toFixed(3)}`) }
  });

  xs.dispose();
  ys.dispose();
  labelTensor.dispose();
  setStatus("training done. click Start Predict.");
};

document.getElementById("predict").onclick = () => {
  if (!model) return setStatus("train first");
  predicting = true;
};

document.getElementById("saveModel").onclick = async () => {
  if (!model) return setStatus("train first");
  await model.save("downloads://hand-sign-model");
  setStatus("model downloaded");
};
