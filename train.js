const video = document.getElementById("video");
const statusEl = document.getElementById("status");
const tf = globalThis.tf;
const Hands = globalThis.Hands;
const Camera = globalThis.Camera;
const drawConnectors = globalThis.drawConnectors;
const drawLandmarks = globalThis.drawLandmarks;
const HAND_CONNECTIONS = globalThis.HAND_CONNECTIONS;

let collecting = null; // "target" | "other" | null
let predicting = false;
let model = null;
let targetCount = 0;
let otherCount = 0;

const X = []; // features
const y = []; // labels: target=1, other=0
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

function setStatus(s) { statusEl.textContent = `Status: ${s}`; }

if (!tf || !Hands || !Camera || !drawConnectors || !drawLandmarks || !HAND_CONNECTIONS) {
  setStatus("Missing library scripts. Reload page.");
  throw new Error("Required global libraries are not loaded.");
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

  if (collecting === "target") {
    X.push(feat); y.push(1);
    targetCount += 1;
    setStatus(`collecting TARGET: ${targetCount}`);
  } else if (collecting === "other") {
    X.push(feat); y.push(0);
    otherCount += 1;
    setStatus(`collecting OTHER: ${otherCount}`);
  }

  if (predicting && model) {
    const pred = tf.tidy(() => {
      const t = tf.tensor2d([feat]);
      return model.predict(t).dataSync()[0];
    });
    setStatus(`predicting: TARGET confidence = ${pred.toFixed(3)}`);
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

document.getElementById("collectTarget").onclick = () => collecting = "target";
document.getElementById("collectOther").onclick = () => collecting = "other";
document.getElementById("stopCollect").onclick = () => { collecting = null; setStatus("collection stopped"); };

document.getElementById("train").onclick = async () => {
  if (X.length < 100) return setStatus("need more samples (>=100)");
  if (targetCount < 30 || otherCount < 30) {
    return setStatus("collect at least 30 TARGET and 30 OTHER samples");
  }
  setStatus("training...");

  const xs = tf.tensor2d(X); // [N,126]
  const ys = tf.tensor2d(y.map(v => [v])); // [N,1]

  if (model) model.dispose();
  model = tf.sequential();
  model.add(tf.layers.dense({ inputShape: [126], units: 128, activation: "relu" }));
  model.add(tf.layers.dense({ units: 64, activation: "relu" }));
  model.add(tf.layers.dense({ units: 1, activation: "sigmoid" }));

  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "binaryCrossentropy",
    metrics: ["accuracy"]
  });

  await model.fit(xs, ys, {
    epochs: 20,
    batchSize: 32,
    validationSplit: 0.2,
    callbacks: { onEpochEnd: (e, logs) => setStatus(`epoch ${e+1} acc=${logs.accuracy?.toFixed(3)} val=${logs.val_accuracy?.toFixed(3)}`) }
  });

  xs.dispose(); ys.dispose();
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
