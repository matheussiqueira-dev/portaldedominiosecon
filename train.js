const video = document.getElementById("video");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusBadge = document.getElementById("statusBadge");
const statusEl = document.getElementById("status");
const classSelect = document.getElementById("classSelect");
const collectClassBtn = document.getElementById("collectClass");
const stopCollectBtn = document.getElementById("stopCollect");
const trainBtn = document.getElementById("train");
const predictBtn = document.getElementById("predict");
const saveModelBtn = document.getElementById("saveModel");
const clearDatasetBtn = document.getElementById("clearDataset");
const resetClassBtn = document.getElementById("resetClass");
const toggleMirrorBtn = document.getElementById("toggleMirror");
const toggleLandmarksBtn = document.getElementById("toggleLandmarks");
const cameraFrame = document.getElementById("cameraFrame");
const datasetTotalEl = document.getElementById("datasetTotal");
const selectedClassLabelEl = document.getElementById("selectedClassLabel");
const modeLabelEl = document.getElementById("modeLabel");
const trainingQuickStatusEl = document.getElementById("trainingQuickStatus");
const goalStatusEl = document.getElementById("goalStatus");
const predictionHeadlineEl = document.getElementById("predictionHeadline");
const epochValueEl = document.getElementById("epochValue");
const valAccuracyValueEl = document.getElementById("valAccuracyValue");
const accuracyValueEl = document.getElementById("accuracyValue");
const lossValueEl = document.getElementById("lossValue");
const validationValueEl = document.getElementById("validationValue");
const valLossValueEl = document.getElementById("valLossValue");
const datasetListEl = document.getElementById("datasetList");
const predictionListEl = document.getElementById("predictionList");
const classGuideEl = document.getElementById("classGuide");

const tf = globalThis.tf;
const Hands = globalThis.Hands;
const Camera = globalThis.Camera;
const drawConnectors = globalThis.drawConnectors;
const drawLandmarks = globalThis.drawLandmarks;
const HAND_CONNECTIONS = globalThis.HAND_CONNECTIONS;
const signConfig = window.DomainExpansionSignConfig;
const featureApi = window.DomainExpansionGestureFeatures;

if (!tf || !Hands || !Camera || !drawConnectors || !drawLandmarks || !HAND_CONNECTIONS) {
  throw new Error("Required global libraries are not loaded.");
}

if (!signConfig || !featureApi || typeof featureApi.getTwoHandFeatures !== "function") {
  throw new Error("Shared sign or feature modules are missing.");
}

const CLASS_LABELS = signConfig.CLASS_ORDER.slice();
const CLASS_INDEX = Object.fromEntries(CLASS_LABELS.map((name, index) => [name, index]));
const MIN_PER_CLASS = 30;
const MIN_TOTAL_SAMPLES = 100;

const X = [];
const y = [];

const state = {
  collectingClass: null,
  predicting: false,
  mirrorCamera: true,
  showLandmarks: true,
  model: null,
  metrics: {
    epoch: null,
    accuracy: null,
    loss: null,
    valAccuracy: null,
    valLoss: null,
  },
  classCounts: Object.fromEntries(CLASS_LABELS.map((name) => [name, 0])),
};

const ui = {
  datasetRows: {},
  predictionRows: {},
};

function setStatus(text, tone) {
  statusEl.textContent = text;
  statusBadge.dataset.tone = tone || "neutral";
}

function formatProbability(value) {
  return value == null ? "-" : Number(value).toFixed(3);
}

function formatPercent(value) {
  if (value == null) {
    return "-";
  }
  return Math.round(Number(value) * 100) + "%";
}

function getMeta(label) {
  return signConfig.getSignMeta(label);
}

function getDatasetTotal() {
  return X.length;
}

function getReadyClassCount() {
  return CLASS_LABELS.filter((label) => state.classCounts[label] >= MIN_PER_CLASS).length;
}

function resetMetrics() {
  state.metrics = {
    epoch: null,
    accuracy: null,
    loss: null,
    valAccuracy: null,
    valLoss: null,
  };
  updateMetricsPanel();
}

function disposeModel() {
  if (state.model) {
    state.model.dispose();
    state.model = null;
  }
}

function invalidateModel(reason) {
  disposeModel();
  state.predicting = false;
  updatePredictButton();
  resetMetrics();
  if (reason) {
    setStatus(reason, "warning");
  }
  updateSummaryPanel();
}

function replaceDataset(nextX, nextY) {
  X.length = 0;
  y.length = 0;
  X.push(...nextX);
  y.push(...nextY);
}

function applyCameraPresentation() {
  cameraFrame.classList.toggle("is-mirrored", state.mirrorCamera);
  toggleMirrorBtn.textContent = state.mirrorCamera ? "Desespelhar camera" : "Espelhar camera";
  toggleMirrorBtn.setAttribute("aria-pressed", String(state.mirrorCamera));
  toggleLandmarksBtn.textContent = state.showLandmarks ? "Ocultar pontos" : "Mostrar pontos";
  toggleLandmarksBtn.setAttribute("aria-pressed", String(state.showLandmarks));
}

function updatePredictButton() {
  predictBtn.textContent = state.predicting ? "Parar previsao" : "Iniciar previsao";
  predictBtn.setAttribute("aria-pressed", String(state.predicting));
}

function updateMetricsPanel() {
  epochValueEl.textContent =
    state.metrics.epoch == null ? "-" : String(Number(state.metrics.epoch) + 1);
  accuracyValueEl.textContent = formatProbability(state.metrics.accuracy);
  lossValueEl.textContent = formatProbability(state.metrics.loss);
  validationValueEl.textContent = formatProbability(state.metrics.valAccuracy);
  valLossValueEl.textContent = formatProbability(state.metrics.valLoss);
  valAccuracyValueEl.textContent = formatProbability(state.metrics.valAccuracy);
}

function updateSummaryPanel() {
  const selectedMeta = getMeta(classSelect.value || CLASS_LABELS[0]);
  const readyCount = getReadyClassCount();
  const total = getDatasetTotal();

  datasetTotalEl.textContent = String(total);
  selectedClassLabelEl.textContent = selectedMeta.label;
  goalStatusEl.textContent = readyCount + "/" + CLASS_LABELS.length + " classes prontas";

  if (state.collectingClass) {
    modeLabelEl.textContent = "Coletando " + getMeta(state.collectingClass).shortLabel;
  } else if (state.predicting) {
    modeLabelEl.textContent = "Previsao ao vivo";
  } else if (state.model) {
    modeLabelEl.textContent = "Modelo pronto";
  } else {
    modeLabelEl.textContent = "Ocioso";
  }

  if (readyCount === CLASS_LABELS.length && total >= MIN_TOTAL_SAMPLES) {
    trainingQuickStatusEl.textContent = state.model ? "Modelo validavel" : "Base pronta para treino";
  } else {
    const missingTotal = Math.max(0, MIN_TOTAL_SAMPLES - total);
    trainingQuickStatusEl.textContent =
      missingTotal > 0 ? "Faltam " + missingTotal + " amostras" : "Ajuste o balanceamento";
  }
}

function renderDatasetRows() {
  datasetListEl.innerHTML = "";
  for (const label of CLASS_LABELS) {
    const meta = getMeta(label);
    const row = document.createElement("article");
    row.className = "dataset-item";
    row.innerHTML =
      '<div class="dataset-top">' +
      "<strong>" +
      meta.label +
      "</strong>" +
      "<span>0/" +
      MIN_PER_CLASS +
      "</span>" +
      "</div>" +
      '<div class="progress-bar"><div class="progress-fill"></div></div>' +
      "<p>" +
      meta.description +
      "</p>";

    const fill = row.querySelector(".progress-fill");
    fill.style.background = "linear-gradient(90deg, " + meta.accent + ", " + meta.accent + ")";
    datasetListEl.appendChild(row);
    ui.datasetRows[label] = {
      row,
      valueEl: row.querySelector("span"),
      fillEl: fill,
    };
  }
  updateDatasetPanel();
}

function updateDatasetPanel() {
  for (const label of CLASS_LABELS) {
    const count = state.classCounts[label];
    const rowRef = ui.datasetRows[label];
    if (!rowRef) {
      continue;
    }
    const progress = Math.min(count / MIN_PER_CLASS, 1);
    rowRef.valueEl.textContent = count + "/" + MIN_PER_CLASS;
    rowRef.fillEl.style.width = Math.round(progress * 100) + "%";
  }
  updateSummaryPanel();
}

function renderPredictionRows() {
  predictionListEl.innerHTML = "";
  for (const label of CLASS_LABELS) {
    const meta = getMeta(label);
    const row = document.createElement("article");
    row.className = "prediction-item";
    row.innerHTML =
      '<div class="prediction-top">' +
      "<strong>" +
      meta.label +
      "</strong>" +
      "<span>0%</span>" +
      "</div>" +
      '<div class="progress-bar"><div class="progress-fill"></div></div>' +
      "<p>" +
      meta.subtitle +
      "</p>";

    const fill = row.querySelector(".progress-fill");
    fill.style.background = "linear-gradient(90deg, " + meta.accent + ", " + meta.accent + ")";
    predictionListEl.appendChild(row);
    ui.predictionRows[label] = {
      row,
      valueEl: row.querySelector("span"),
      fillEl: fill,
    };
  }
}

function updatePredictionPanel(probabilities, activeLabel) {
  const probabilityMap = {};
  CLASS_LABELS.forEach((label, index) => {
    probabilityMap[label] = probabilities ? probabilities[index] || 0 : 0;
  });

  for (const label of CLASS_LABELS) {
    const rowRef = ui.predictionRows[label];
    if (!rowRef) {
      continue;
    }
    const value = probabilityMap[label] || 0;
    rowRef.valueEl.textContent = Math.round(value * 100) + "%";
    rowRef.fillEl.style.width = Math.round(value * 100) + "%";
    rowRef.row.style.borderColor =
      label === activeLabel ? "rgba(0, 229, 255, 0.28)" : "rgba(143, 166, 178, 0.12)";
  }
}

function renderClassGuide() {
  classGuideEl.innerHTML = "";
  for (const label of CLASS_LABELS) {
    const meta = getMeta(label);
    const card = document.createElement("article");
    card.className = "guide-card";
    card.style.background = meta.lightAccent;
    card.innerHTML =
      "<small>" +
      meta.subtitle +
      "</small>" +
      "<h3>" +
      meta.label +
      "</h3>" +
      "<p>" +
      meta.description +
      "</p>";
    classGuideEl.appendChild(card);
  }
}

function argMax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i += 1) {
    if (arr[i] > arr[best]) {
      best = i;
    }
  }
  return best;
}

renderDatasetRows();
renderPredictionRows();
renderClassGuide();
applyCameraPresentation();
updatePredictButton();
updateMetricsPanel();

classSelect.innerHTML = CLASS_LABELS.map((label) => {
  const meta = getMeta(label);
  return '<option value="' + label + '">' + meta.label + "</option>";
}).join("");
updateSummaryPanel();

classSelect.addEventListener("change", updateSummaryPanel);

collectClassBtn.addEventListener("click", () => {
  state.collectingClass = classSelect.value;
  updateSummaryPanel();
  setStatus("Coletando amostras para " + getMeta(state.collectingClass).label + ".", "neutral");
});

stopCollectBtn.addEventListener("click", () => {
  state.collectingClass = null;
  updateSummaryPanel();
  setStatus("Coleta interrompida.", "neutral");
});

predictBtn.addEventListener("click", () => {
  if (!state.model) {
    setStatus("Treine um modelo antes de iniciar a previsao.", "warning");
    return;
  }
  state.predicting = !state.predicting;
  updatePredictButton();
  updateSummaryPanel();
  predictionHeadlineEl.textContent = state.predicting ? "Aguardando amostra" : "Previsao pausada";
  setStatus(
    state.predicting ? "Previsao ao vivo ativada." : "Previsao ao vivo pausada.",
    "neutral",
  );
});

toggleMirrorBtn.addEventListener("click", () => {
  state.mirrorCamera = !state.mirrorCamera;
  applyCameraPresentation();
});

toggleLandmarksBtn.addEventListener("click", () => {
  state.showLandmarks = !state.showLandmarks;
  applyCameraPresentation();
});

resetClassBtn.addEventListener("click", () => {
  const targetLabel = classSelect.value;
  const targetIndex = CLASS_INDEX[targetLabel];
  const nextX = [];
  const nextY = [];

  for (let index = 0; index < y.length; index += 1) {
    if (y[index] !== targetIndex) {
      nextX.push(X[index]);
      nextY.push(y[index]);
    }
  }

  replaceDataset(nextX, nextY);
  state.collectingClass = null;
  state.classCounts[targetLabel] = 0;
  updateDatasetPanel();
  invalidateModel("Classe " + getMeta(targetLabel).label + " resetada. Treine novamente.");
});

clearDatasetBtn.addEventListener("click", () => {
  replaceDataset([], []);
  state.collectingClass = null;
  for (const label of CLASS_LABELS) {
    state.classCounts[label] = 0;
  }
  updateDatasetPanel();
  updateSummaryPanel();
  updatePredictionPanel(null, null);
  predictionHeadlineEl.textContent = "Sem previsao";
  invalidateModel("Base limpa. Colete novas amostras antes de treinar.");
});

trainBtn.addEventListener("click", async () => {
  if (getDatasetTotal() < MIN_TOTAL_SAMPLES) {
    setStatus("Colete pelo menos " + MIN_TOTAL_SAMPLES + " amostras antes de treinar.", "warning");
    return;
  }

  const lowClasses = CLASS_LABELS.filter((label) => state.classCounts[label] < MIN_PER_CLASS);
  if (lowClasses.length) {
    setStatus(
      "Complete a meta minima das classes: " +
        lowClasses.map((label) => getMeta(label).label).join(", ") +
        ".",
      "warning",
    );
    return;
  }

  state.collectingClass = null;
  state.predicting = false;
  updatePredictButton();
  updateSummaryPanel();
  setStatus("Treinando modelo...", "neutral");

  const xs = tf.tensor2d(X);
  const labelTensor = tf.tensor1d(y, "int32");
  const ys = tf.oneHot(labelTensor, CLASS_LABELS.length);

  disposeModel();
  state.model = tf.sequential();
  state.model.add(tf.layers.dense({ inputShape: [126], units: 128, activation: "relu" }));
  state.model.add(tf.layers.dense({ units: 64, activation: "relu" }));
  state.model.add(tf.layers.dense({ units: CLASS_LABELS.length, activation: "softmax" }));

  state.model.compile({
    optimizer: tf.train.adam(0.001),
    loss: "categoricalCrossentropy",
    metrics: ["accuracy"],
  });

  let trainingSucceeded = false;

  try {
    await state.model.fit(xs, ys, {
      epochs: 20,
      batchSize: 32,
      validationSplit: 0.2,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          state.metrics = {
            epoch,
            accuracy: logs.accuracy ?? null,
            loss: logs.loss ?? null,
            valAccuracy: logs.val_accuracy ?? null,
            valLoss: logs.val_loss ?? null,
          };
          updateMetricsPanel();
          setStatus(
            "Epoch " +
              (epoch + 1) +
              ": acc=" +
              formatProbability(logs.accuracy) +
              ", val=" +
              formatProbability(logs.val_accuracy),
            "neutral",
          );
        },
      },
    });
    trainingSucceeded = true;
  } catch (error) {
    disposeModel();
    setStatus("Falha durante o treino. Consulte o console.", "error");
    console.error(error);
  } finally {
    xs.dispose();
    ys.dispose();
    labelTensor.dispose();
  }

  if (!trainingSucceeded) {
    updateSummaryPanel();
    return;
  }

  updateSummaryPanel();
  setStatus("Treino concluido. Inicie a previsao para validar o modelo.", "success");
});

saveModelBtn.addEventListener("click", async () => {
  if (!state.model) {
    setStatus("Nenhum modelo treinado para exportar.", "warning");
    return;
  }
  await state.model.save("downloads://hand-sign-model");
  setStatus("Modelo exportado com sucesso.", "success");
});

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
  const landmarks = results.multiHandLandmarks || [];

  if (state.showLandmarks && landmarks.length) {
    for (const handLandmarks of landmarks) {
      drawConnectors(ctx, handLandmarks, HAND_CONNECTIONS, {
        color: "#00E5FF",
        lineWidth: 2,
      });
      drawLandmarks(ctx, handLandmarks, {
        color: "#33F3FF",
        lineWidth: 1,
        radius: 3,
      });
    }
  }

  if (!landmarks.length) {
    if (state.predicting) {
      predictionHeadlineEl.textContent = "Aguardando maos";
      updatePredictionPanel(null, null);
    }
    return;
  }

  const features = featureApi.getTwoHandFeatures(results);

  if (state.collectingClass) {
    X.push(features);
    y.push(CLASS_INDEX[state.collectingClass]);
    state.classCounts[state.collectingClass] += 1;
    updateDatasetPanel();
    setStatus(
      "Coletando " +
        getMeta(state.collectingClass).label +
        ": " +
        state.classCounts[state.collectingClass] +
        " amostras.",
      "neutral",
    );
  }

  if (state.predicting && state.model) {
    const probabilities = tf.tidy(() => {
      const tensor = tf.tensor2d([features]);
      return Array.from(state.model.predict(tensor).dataSync());
    });
    const index = argMax(probabilities);
    const label = CLASS_LABELS[index] || "class_" + index;
    const confidence = probabilities[index] || 0;
    updatePredictionPanel(probabilities, label);
    predictionHeadlineEl.textContent =
      getMeta(label).label + " (" + formatPercent(confidence) + ")";
    setStatus(
      "Previsao ao vivo: " + getMeta(label).label + " com " + formatProbability(confidence) + ".",
      "success",
    );
  }
});

let stream;
try {
  stream = await navigator.mediaDevices.getUserMedia({ video: true });
} catch (error) {
  setStatus("Nao foi possivel acessar a camera.", "error");
  throw error;
}

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
setStatus("Camera pronta. Selecione uma classe e inicie a coleta.", "success");
