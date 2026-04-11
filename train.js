/**
 * @fileoverview Pipeline de treinamento do classificador de gestos.
 *
 * Gerencia coleta de amostras via webcam, treino de rede neural com
 * TensorFlow.js (incluindo regularização L2, dropout e data augmentation),
 * validação ao vivo e exportação do modelo.
 *
 * Melhorias em relação à versão anterior:
 *  - Regularização L2 (kernel_regularizer) nas camadas densas para reduzir overfitting.
 *  - Camadas Dropout (20%) intercaladas para maior capacidade de generalização.
 *  - Data Augmentation: jitter gaussiano nas features durante o treino.
 *  - Persistência de sessão via localStorage (session-persistence.js).
 *  - Barra de progresso de épocas na interface.
 *  - Confirmação visual ao exportar o modelo.
 *  - Tratamento robusto de erros com error-handler.js.
 *  - Dispose completo de tensores em todos os caminhos de execução.
 *
 * Atalhos de teclado:
 *   C  — coletar amostras para a classe selecionada
 *   S  — parar coleta
 *   P  — ativar / pausar previsão ao vivo
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

(function () {
  "use strict";

  // ─── Referência ao logger ──────────────────────────────────────────────────
  var logger = window.DomainExpansionErrorHandler || {
    info:  function (m)    { console.info(m); },
    warn:  function (m, e) { console.warn(m, e); },
    error: function (m, e) { console.error(m, e); },
  };

  var persistence = window.DomainExpansionSessionPersistence || null;

  // ─── Referências ao DOM ────────────────────────────────────────────────────

  var video               = document.getElementById("video");
  var canvas              = document.getElementById("overlay");
  var ctx                 = canvas ? canvas.getContext("2d") : null;
  var statusBadge         = document.getElementById("statusBadge");
  var statusEl            = document.getElementById("status");
  var classSelect         = document.getElementById("classSelect");
  var collectClassBtn     = document.getElementById("collectClass");
  var stopCollectBtn      = document.getElementById("stopCollect");
  var trainBtn            = document.getElementById("train");
  var predictBtn          = document.getElementById("predict");
  var saveModelBtn        = document.getElementById("saveModel");
  var clearDatasetBtn     = document.getElementById("clearDataset");
  var resetClassBtn       = document.getElementById("resetClass");
  var toggleMirrorBtn     = document.getElementById("toggleMirror");
  var toggleLandmarksBtn  = document.getElementById("toggleLandmarks");
  var cameraFrame         = document.getElementById("cameraFrame");
  var datasetTotalEl      = document.getElementById("datasetTotal");
  var selectedClassLabelEl = document.getElementById("selectedClassLabel");
  var modeLabelEl         = document.getElementById("modeLabel");
  var trainingQuickStatusEl = document.getElementById("trainingQuickStatus");
  var goalStatusEl        = document.getElementById("goalStatus");
  var predictionHeadlineEl = document.getElementById("predictionHeadline");
  var epochValueEl        = document.getElementById("epochValue");
  var valAccuracyValueEl  = document.getElementById("valAccuracyValue");
  var accuracyValueEl     = document.getElementById("accuracyValue");
  var lossValueEl         = document.getElementById("lossValue");
  var validationValueEl   = document.getElementById("validationValue");
  var valLossValueEl      = document.getElementById("valLossValue");
  var datasetListEl       = document.getElementById("datasetList");
  var predictionListEl    = document.getElementById("predictionList");
  var classGuideEl        = document.getElementById("classGuide");
  /** Barra de progresso de épocas (elemento opcional no HTML). */
  var epochProgressEl     = document.getElementById("epochProgress");

  // ─── Dependências externas ─────────────────────────────────────────────────

  var tf             = globalThis.tf;
  var Hands          = globalThis.Hands;
  var Camera         = globalThis.Camera;
  var drawConnectors = globalThis.drawConnectors;
  var drawLandmarks  = globalThis.drawLandmarks;
  var HAND_CONNECTIONS = globalThis.HAND_CONNECTIONS;
  var signConfig     = window.DomainExpansionSignConfig;
  var featureApi     = window.DomainExpansionGestureFeatures;

  if (!tf || !Hands || !Camera || !drawConnectors || !drawLandmarks || !HAND_CONNECTIONS) {
    throw new Error("Bibliotecas globais necessárias não foram carregadas.");
  }

  if (!signConfig || !featureApi || typeof featureApi.getTwoHandFeatures !== "function") {
    throw new Error("Módulos de sinal ou features ausentes.");
  }

  // ─── Constantes de treinamento ─────────────────────────────────────────────

  var CLASS_LABELS     = signConfig.CLASS_ORDER.slice();
  var CLASS_INDEX      = Object.fromEntries(CLASS_LABELS.map(function (n, i) { return [n, i]; }));
  var MIN_PER_CLASS    = 30;
  var MIN_TOTAL        = 100;
  var EPOCHS           = 20;
  var BATCH_SIZE       = 32;
  var VALIDATION_SPLIT = 0.2;
  var LEARNING_RATE    = 0.001;
  var L2_LAMBDA        = 1e-4;
  var DROPOUT_RATE     = 0.2;

  /** Intensidade do jitter gaussiano para data augmentation. */
  var AUGMENT_NOISE_STD = 0.02;

  // ─── Datasets em memória ───────────────────────────────────────────────────

  var X = [];
  var y = [];

  // ─── Estado da aplicação ───────────────────────────────────────────────────

  var state = {
    collectingClass: null,
    predicting:      false,
    mirrorCamera:    true,
    showLandmarks:   true,
    model:           null,
    training:        false,
    metrics: {
      epoch:       null,
      accuracy:    null,
      loss:        null,
      valAccuracy: null,
      valLoss:     null,
    },
    classCounts: Object.fromEntries(CLASS_LABELS.map(function (n) { return [n, 0]; })),
  };

  var ui = {
    datasetRows:    {},
    predictionRows: {},
  };

  // ─── Utilitários ──────────────────────────────────────────────────────────

  function setStatus(text, tone) {
    if (statusEl)    statusEl.textContent    = text;
    if (statusBadge) statusBadge.dataset.tone = tone || "neutral";
  }

  function formatProbability(value) {
    return value == null ? "-" : Number(value).toFixed(3);
  }

  function formatPercent(value) {
    return value == null ? "-" : Math.round(Number(value) * 100) + "%";
  }

  function getMeta(label) { return signConfig.getSignMeta(label); }

  function getDatasetTotal()  { return X.length; }

  function getReadyClassCount() {
    return CLASS_LABELS.filter(function (l) { return state.classCounts[l] >= MIN_PER_CLASS; }).length;
  }

  function argMax(arr) {
    var best = 0;
    for (var i = 1; i < arr.length; i++) {
      if (arr[i] > arr[best]) best = i;
    }
    return best;
  }

  // ─── Gestão do modelo ─────────────────────────────────────────────────────

  function disposeModel() {
    if (state.model) {
      try { state.model.dispose(); } catch (_) {}
      state.model = null;
    }
  }

  function resetMetrics() {
    state.metrics = { epoch: null, accuracy: null, loss: null, valAccuracy: null, valLoss: null };
    updateMetricsPanel();
  }

  function invalidateModel(reason) {
    disposeModel();
    state.predicting = false;
    updatePredictButton();
    resetMetrics();
    if (reason) setStatus(reason, "warning");
    updateSummaryPanel();
  }

  function replaceDataset(nextX, nextY) {
    X.length = 0;
    y.length = 0;
    X.push.apply(X, nextX);
    y.push.apply(y, nextY);
  }

  // ─── Data Augmentation ────────────────────────────────────────────────────

  /**
   * Aplica jitter gaussiano a um vetor de features.
   * Aumenta a diversidade do dataset sem coletar novas amostras.
   *
   * @param {number[]} features - Vetor de 126 valores.
   * @param {number}   std      - Desvio padrão do ruído.
   * @returns {number[]} Cópia com ruído adicionado.
   */
  function applyGaussianNoise(features, std) {
    var out = new Array(features.length);
    for (var i = 0; i < features.length; i++) {
      // Box-Muller transform para gerar ruído gaussiano.
      var u1    = Math.random() + 1e-12;
      var u2    = Math.random();
      var noise = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      out[i]    = features[i] + noise * std;
    }
    return out;
  }

  /**
   * Gera versões aumentadas do dataset de treinamento.
   * Cada amostra original produz uma cópia aumentada, dobrando o dataset.
   *
   * @param {number[][]} origX
   * @param {number[]}   origY
   * @returns {{ augX: number[][], augY: number[] }}
   */
  function augmentDataset(origX, origY) {
    var augX = origX.slice();
    var augY = origY.slice();
    for (var i = 0; i < origX.length; i++) {
      augX.push(applyGaussianNoise(origX[i], AUGMENT_NOISE_STD));
      augY.push(origY[i]);
    }
    return { augX: augX, augY: augY };
  }

  // ─── Controles de câmera ──────────────────────────────────────────────────

  function applyCameraPresentation() {
    if (cameraFrame) cameraFrame.classList.toggle("is-mirrored", state.mirrorCamera);
    if (toggleMirrorBtn) {
      toggleMirrorBtn.textContent = state.mirrorCamera ? "Desespelhar câmera" : "Espelhar câmera";
      toggleMirrorBtn.setAttribute("aria-pressed", String(state.mirrorCamera));
    }
    if (toggleLandmarksBtn) {
      toggleLandmarksBtn.textContent = state.showLandmarks ? "Ocultar pontos" : "Mostrar pontos";
      toggleLandmarksBtn.setAttribute("aria-pressed", String(state.showLandmarks));
    }
  }

  function updatePredictButton() {
    if (!predictBtn) return;
    predictBtn.textContent = state.predicting ? "Parar previsão" : "Iniciar previsão";
    predictBtn.setAttribute("aria-pressed", String(state.predicting));
  }

  // ─── Painel de métricas ────────────────────────────────────────────────────

  function updateMetricsPanel() {
    if (epochValueEl)      epochValueEl.textContent      = state.metrics.epoch == null ? "-" : String(Number(state.metrics.epoch) + 1);
    if (accuracyValueEl)   accuracyValueEl.textContent   = formatProbability(state.metrics.accuracy);
    if (lossValueEl)       lossValueEl.textContent       = formatProbability(state.metrics.loss);
    if (validationValueEl) validationValueEl.textContent = formatProbability(state.metrics.valAccuracy);
    if (valLossValueEl)    valLossValueEl.textContent    = formatProbability(state.metrics.valLoss);
    if (valAccuracyValueEl) valAccuracyValueEl.textContent = formatProbability(state.metrics.valAccuracy);

    // Atualiza barra de progresso se existir no HTML.
    if (epochProgressEl && state.metrics.epoch != null) {
      epochProgressEl.value = state.metrics.epoch + 1;
      epochProgressEl.max   = EPOCHS;
    }
  }

  // ─── Painel de resumo ─────────────────────────────────────────────────────

  function updateSummaryPanel() {
    var selectedMeta = getMeta(classSelect ? (classSelect.value || CLASS_LABELS[0]) : CLASS_LABELS[0]);
    var readyCount   = getReadyClassCount();
    var total        = getDatasetTotal();

    if (datasetTotalEl)       datasetTotalEl.textContent       = String(total);
    if (selectedClassLabelEl) selectedClassLabelEl.textContent = selectedMeta.label;
    if (goalStatusEl)         goalStatusEl.textContent         = readyCount + "/" + CLASS_LABELS.length + " classes prontas";

    if (modeLabelEl) {
      if (state.training) {
        modeLabelEl.textContent = "Treinando…";
      } else if (state.collectingClass) {
        modeLabelEl.textContent = "Coletando " + getMeta(state.collectingClass).shortLabel;
      } else if (state.predicting) {
        modeLabelEl.textContent = "Previsão ao vivo";
      } else if (state.model) {
        modeLabelEl.textContent = "Modelo pronto";
      } else {
        modeLabelEl.textContent = "Ocioso";
      }
    }

    if (trainingQuickStatusEl) {
      if (readyCount === CLASS_LABELS.length && total >= MIN_TOTAL) {
        trainingQuickStatusEl.textContent = state.model ? "Modelo validável" : "Base pronta para treino";
      } else {
        var missingTotal = Math.max(0, MIN_TOTAL - total);
        trainingQuickStatusEl.textContent = missingTotal > 0
          ? "Faltam " + missingTotal + " amostras"
          : "Ajuste o balanceamento";
      }
    }
  }

  // ─── Renderização de rows ─────────────────────────────────────────────────

  function renderDatasetRows() {
    if (!datasetListEl) return;
    datasetListEl.innerHTML = "";
    for (var i = 0; i < CLASS_LABELS.length; i++) {
      var label = CLASS_LABELS[i];
      var meta  = getMeta(label);
      var row   = document.createElement("article");
      row.className = "dataset-item";
      row.innerHTML =
        '<div class="dataset-top"><strong>' + meta.label + "</strong>" +
        "<span>0/" + MIN_PER_CLASS + "</span></div>" +
        '<div class="progress-bar"><div class="progress-fill"></div></div>' +
        "<p>" + meta.description + "</p>";

      var fill = row.querySelector(".progress-fill");
      fill.style.background = "linear-gradient(90deg, " + meta.accent + ", " + meta.accent + ")";
      datasetListEl.appendChild(row);
      ui.datasetRows[label] = { row: row, valueEl: row.querySelector("span"), fillEl: fill };
    }
    updateDatasetPanel();
  }

  function updateDatasetPanel() {
    for (var i = 0; i < CLASS_LABELS.length; i++) {
      var label  = CLASS_LABELS[i];
      var count  = state.classCounts[label];
      var rowRef = ui.datasetRows[label];
      if (!rowRef) continue;
      var progress = Math.min(count / MIN_PER_CLASS, 1);
      rowRef.valueEl.textContent = count + "/" + MIN_PER_CLASS;
      rowRef.fillEl.style.width  = Math.round(progress * 100) + "%";
    }
    updateSummaryPanel();
  }

  function renderPredictionRows() {
    if (!predictionListEl) return;
    predictionListEl.innerHTML = "";
    for (var i = 0; i < CLASS_LABELS.length; i++) {
      var label = CLASS_LABELS[i];
      var meta  = getMeta(label);
      var row   = document.createElement("article");
      row.className = "prediction-item";
      row.innerHTML =
        '<div class="prediction-top"><strong>' + meta.label + "</strong>" +
        "<span>0%</span></div>" +
        '<div class="progress-bar"><div class="progress-fill"></div></div>' +
        "<p>" + meta.subtitle + "</p>";

      var fill = row.querySelector(".progress-fill");
      fill.style.background = "linear-gradient(90deg, " + meta.accent + ", " + meta.accent + ")";
      predictionListEl.appendChild(row);
      ui.predictionRows[label] = { row: row, valueEl: row.querySelector("span"), fillEl: fill };
    }
  }

  function updatePredictionPanel(probabilities, activeLabel) {
    var map = {};
    for (var j = 0; j < CLASS_LABELS.length; j++) {
      map[CLASS_LABELS[j]] = probabilities ? (probabilities[j] || 0) : 0;
    }
    for (var i = 0; i < CLASS_LABELS.length; i++) {
      var label  = CLASS_LABELS[i];
      var rowRef = ui.predictionRows[label];
      if (!rowRef) continue;
      var value = map[label] || 0;
      rowRef.valueEl.textContent = Math.round(value * 100) + "%";
      rowRef.fillEl.style.width  = Math.round(value * 100) + "%";
      rowRef.row.style.borderColor = label === activeLabel
        ? "rgba(0, 229, 255, 0.28)"
        : "rgba(143, 166, 178, 0.12)";
    }
  }

  function renderClassGuide() {
    if (!classGuideEl) return;
    classGuideEl.innerHTML = "";
    for (var i = 0; i < CLASS_LABELS.length; i++) {
      var label = CLASS_LABELS[i];
      var meta  = getMeta(label);
      var card  = document.createElement("article");
      card.className = "guide-card";
      card.style.background = meta.lightAccent;
      card.innerHTML =
        "<small>" + meta.subtitle + "</small>" +
        "<h3>" + meta.label + "</h3>" +
        "<p>" + meta.description + "</p>";
      classGuideEl.appendChild(card);
    }
  }

  // ─── Inicialização da UI ─────────────────────────────────────────────────

  renderDatasetRows();
  renderPredictionRows();
  renderClassGuide();
  applyCameraPresentation();
  updatePredictButton();
  updateMetricsPanel();

  if (classSelect) {
    classSelect.innerHTML = CLASS_LABELS.map(function (label) {
      var meta = getMeta(label);
      return '<option value="' + label + '">' + meta.label + "</option>";
    }).join("");
  }
  updateSummaryPanel();

  // ─── Restaurar sessão salva ───────────────────────────────────────────────

  (function tryRestoreSession() {
    if (!persistence) return;
    var meta = persistence.getSessionMeta();
    if (!meta.ok) return;

    var restored = persistence.loadSession();
    if (!restored.ok) return;

    var d = restored.data;
    replaceDataset(d.X, d.y);

    for (var label in d.classCounts) {
      if (Object.prototype.hasOwnProperty.call(d.classCounts, label) && state.classCounts[label] !== undefined) {
        state.classCounts[label] = d.classCounts[label];
      }
    }

    updateDatasetPanel();
    setStatus(
      "Sessão restaurada: " + d.sampleCount + " amostras salvas em " +
        new Date(d.savedAt).toLocaleString("pt-BR") + ".",
      "neutral"
    );
    logger.info("Sessão de treinamento restaurada do localStorage.");
  })();

  // ─── Eventos de controle ──────────────────────────────────────────────────

  if (classSelect) {
    classSelect.addEventListener("change", updateSummaryPanel);
  }

  if (collectClassBtn) {
    collectClassBtn.addEventListener("click", function () {
      state.collectingClass = classSelect ? classSelect.value : null;
      if (!state.collectingClass) return;
      updateSummaryPanel();
      setStatus("Coletando amostras para " + getMeta(state.collectingClass).label + ".", "neutral");
    });
  }

  if (stopCollectBtn) {
    stopCollectBtn.addEventListener("click", function () {
      state.collectingClass = null;
      updateSummaryPanel();
      setStatus("Coleta interrompida.", "neutral");
      // Persiste automaticamente ao parar coleta.
      if (persistence) {
        var result = persistence.saveSession(X, y, state.classCounts);
        if (result.ok) {
          logger.info("Sessão salva automaticamente após coleta.");
        } else {
          logger.warn("Falha ao salvar sessão: " + result.error);
        }
      }
    });
  }

  if (predictBtn) {
    predictBtn.addEventListener("click", function () {
      if (!state.model) {
        setStatus("Treine um modelo antes de iniciar a previsão.", "warning");
        return;
      }
      state.predicting = !state.predicting;
      updatePredictButton();
      updateSummaryPanel();
      if (predictionHeadlineEl) {
        predictionHeadlineEl.textContent = state.predicting ? "Aguardando amostra" : "Previsão pausada";
      }
      setStatus(state.predicting ? "Previsão ao vivo ativada." : "Previsão ao vivo pausada.", "neutral");
    });
  }

  if (toggleMirrorBtn) {
    toggleMirrorBtn.addEventListener("click", function () {
      state.mirrorCamera = !state.mirrorCamera;
      applyCameraPresentation();
    });
  }

  if (toggleLandmarksBtn) {
    toggleLandmarksBtn.addEventListener("click", function () {
      state.showLandmarks = !state.showLandmarks;
      applyCameraPresentation();
    });
  }

  if (resetClassBtn) {
    resetClassBtn.addEventListener("click", function () {
      var targetLabel = classSelect ? classSelect.value : null;
      if (!targetLabel) return;
      var targetIndex = CLASS_INDEX[targetLabel];
      var nextX = [];
      var nextY = [];
      for (var k = 0; k < y.length; k++) {
        if (y[k] !== targetIndex) {
          nextX.push(X[k]);
          nextY.push(y[k]);
        }
      }
      replaceDataset(nextX, nextY);
      state.collectingClass         = null;
      state.classCounts[targetLabel] = 0;
      updateDatasetPanel();
      invalidateModel("Classe " + getMeta(targetLabel).label + " resetada. Treine novamente.");
    });
  }

  if (clearDatasetBtn) {
    clearDatasetBtn.addEventListener("click", function () {
      replaceDataset([], []);
      state.collectingClass = null;
      for (var i = 0; i < CLASS_LABELS.length; i++) {
        state.classCounts[CLASS_LABELS[i]] = 0;
      }
      updateDatasetPanel();
      updateSummaryPanel();
      updatePredictionPanel(null, null);
      if (predictionHeadlineEl) predictionHeadlineEl.textContent = "Sem previsão";
      invalidateModel("Base limpa. Colete novas amostras antes de treinar.");
      if (persistence) persistence.clearSession();
    });
  }

  // ─── Treino ───────────────────────────────────────────────────────────────

  if (trainBtn) {
    trainBtn.addEventListener("click", async function () {
      if (state.training) {
        setStatus("Treinamento já em andamento.", "warning");
        return;
      }

      if (getDatasetTotal() < MIN_TOTAL) {
        setStatus("Colete pelo menos " + MIN_TOTAL + " amostras antes de treinar.", "warning");
        return;
      }

      var lowClasses = CLASS_LABELS.filter(function (l) { return state.classCounts[l] < MIN_PER_CLASS; });
      if (lowClasses.length) {
        setStatus(
          "Complete a meta mínima das classes: " +
            lowClasses.map(function (l) { return getMeta(l).label; }).join(", ") + ".",
          "warning"
        );
        return;
      }

      state.collectingClass = null;
      state.predicting      = false;
      state.training        = true;
      updatePredictButton();
      updateSummaryPanel();
      setStatus("Preparando dados de treinamento…", "neutral");

      // Data augmentation: dobra o dataset com ruído gaussiano.
      var augmented = augmentDataset(X, y);
      var augX = augmented.augX;
      var augY = augmented.augY;

      setStatus("Iniciando treinamento com " + augX.length + " amostras (aug)…", "neutral");

      var xs          = tf.tensor2d(augX);
      var labelTensor = tf.tensor1d(augY, "int32");
      var ys          = tf.oneHot(labelTensor, CLASS_LABELS.length);

      disposeModel();

      // ── Arquitetura da rede com regularização L2 e Dropout ──────────────
      state.model = tf.sequential();

      state.model.add(tf.layers.dense({
        inputShape:       [126],
        units:            128,
        activation:       "relu",
        kernelRegularizer: tf.regularizers.l2({ l2: L2_LAMBDA }),
      }));
      state.model.add(tf.layers.dropout({ rate: DROPOUT_RATE }));

      state.model.add(tf.layers.dense({
        units:            64,
        activation:       "relu",
        kernelRegularizer: tf.regularizers.l2({ l2: L2_LAMBDA }),
      }));
      state.model.add(tf.layers.dropout({ rate: DROPOUT_RATE }));

      state.model.add(tf.layers.dense({
        units:      CLASS_LABELS.length,
        activation: "softmax",
      }));

      state.model.compile({
        optimizer: tf.train.adam(LEARNING_RATE),
        loss:      "categoricalCrossentropy",
        metrics:   ["accuracy"],
      });

      var trainingSucceeded = false;

      try {
        await state.model.fit(xs, ys, {
          epochs:          EPOCHS,
          batchSize:       BATCH_SIZE,
          validationSplit: VALIDATION_SPLIT,
          callbacks: {
            onEpochEnd: function (epoch, logs) {
              state.metrics = {
                epoch:       epoch,
                accuracy:    logs.accuracy     ?? null,
                loss:        logs.loss         ?? null,
                valAccuracy: logs.val_accuracy ?? null,
                valLoss:     logs.val_loss     ?? null,
              };
              updateMetricsPanel();
              setStatus(
                "Epoch " + (epoch + 1) + "/" + EPOCHS + ": " +
                  "acc=" + formatProbability(logs.accuracy) +
                  ", val=" + formatProbability(logs.val_accuracy),
                "neutral"
              );
            },
          },
        });
        trainingSucceeded = true;
      } catch (err) {
        disposeModel();
        logger.error("Falha durante o treino.", err);
        setStatus("Falha durante o treino. Consulte o console.", "error");
      } finally {
        xs.dispose();
        ys.dispose();
        labelTensor.dispose();
        state.training = false;
        updateSummaryPanel();
      }

      if (!trainingSucceeded) return;

      // Persiste a sessão após treino bem-sucedido.
      if (persistence) {
        var saved = persistence.saveSession(X, y, state.classCounts);
        if (!saved.ok) logger.warn("Falha ao persistir sessão pós-treino: " + saved.error);
      }

      setStatus("Treino concluído. Inicie a previsão para validar o modelo.", "success");
    });
  }

  // ─── Exportação do modelo ─────────────────────────────────────────────────

  if (saveModelBtn) {
    saveModelBtn.addEventListener("click", async function () {
      if (!state.model) {
        setStatus("Nenhum modelo treinado para exportar.", "warning");
        return;
      }
      try {
        await state.model.save("downloads://hand-sign-model");
        setStatus("Modelo exportado com sucesso! Verifique sua pasta de downloads.", "success");
        logger.info("Modelo exportado pelo usuário.");
      } catch (err) {
        logger.error("Falha ao exportar modelo.", err);
        setStatus("Falha ao exportar o modelo. Consulte o console.", "error");
      }
    });
  }

  // ─── Atalhos de teclado ───────────────────────────────────────────────────

  document.addEventListener("keydown", function (e) {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;

    switch (e.key) {
      case "c": case "C":
        if (collectClassBtn) collectClassBtn.click();
        break;
      case "s": case "S":
        if (stopCollectBtn) stopCollectBtn.click();
        break;
      case "p": case "P":
        if (!e.shiftKey && predictBtn) predictBtn.click();
        break;
    }
  });

  // ─── MediaPipe Hands ──────────────────────────────────────────────────────

  var hands = new Hands({
    locateFile: function (file) {
      return "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file;
    },
  });

  hands.setOptions({
    maxNumHands:            2,
    modelComplexity:        1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence:  0.7,
  });

  hands.onResults(function (results) {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var landmarks = results.multiHandLandmarks || [];

    if (state.showLandmarks && landmarks.length) {
      for (var h = 0; h < landmarks.length; h++) {
        drawConnectors(ctx, landmarks[h], HAND_CONNECTIONS, { color: "#00E5FF", lineWidth: 2 });
        drawLandmarks(ctx, landmarks[h], { color: "#33F3FF", lineWidth: 1, radius: 3 });
      }
    }

    if (!landmarks.length) {
      if (state.predicting && predictionHeadlineEl) {
        predictionHeadlineEl.textContent = "Aguardando mãos";
        updatePredictionPanel(null, null);
      }
      return;
    }

    var features;
    try {
      features = featureApi.getTwoHandFeatures(results);
    } catch (err) {
      logger.warn("Falha ao extrair features.", err);
      return;
    }

    // Coleta de amostras.
    if (state.collectingClass) {
      X.push(features);
      y.push(CLASS_INDEX[state.collectingClass]);
      state.classCounts[state.collectingClass] += 1;
      updateDatasetPanel();
      setStatus(
        "Coletando " + getMeta(state.collectingClass).label + ": " +
          state.classCounts[state.collectingClass] + " amostras.",
        "neutral"
      );
    }

    // Previsão ao vivo.
    if (state.predicting && state.model) {
      var probabilities = tf.tidy(function () {
        var tensor = tf.tensor2d([features]);
        return Array.from(state.model.predict(tensor).dataSync());
      });

      var index      = argMax(probabilities);
      var label      = CLASS_LABELS[index] || ("class_" + index);
      var confidence = probabilities[index] || 0;

      updatePredictionPanel(probabilities, label);

      if (predictionHeadlineEl) {
        predictionHeadlineEl.textContent = getMeta(label).label + " (" + formatPercent(confidence) + ")";
      }

      setStatus(
        "Previsão ao vivo: " + getMeta(label).label + " com " + formatProbability(confidence) + ".",
        "success"
      );
    }
  });

  // ─── Câmera ───────────────────────────────────────────────────────────────

  (async function initCamera() {
    var stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (err) {
      var msg = err.name === "NotAllowedError"
        ? "Permissão de câmera negada. Clique no ícone da câmera para conceder acesso."
        : "Não foi possível acessar a câmera: " + err.message;
      setStatus(msg, "error");
      logger.error(msg, err);
      throw err;
    }

    video.srcObject = stream;
    video.addEventListener("loadeddata", function () {
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
    });

    var camera = new Camera(video, {
      onFrame: async function () {
        try {
          await hands.send({ image: video });
        } catch (err) {
          logger.warn("Erro ao processar quadro MediaPipe.", err);
        }
      },
      width:  640,
      height: 480,
    });

    await camera.start();
    setStatus("Câmera pronta. Selecione uma classe e inicie a coleta.", "success");
    logger.info("Trainer inicializado com sucesso.");
  })();

  // ─── Data augmentation helper (exportado para testes) ────────────────────

  window._PortalEconTrainUtils = Object.freeze({
    applyGaussianNoise: applyGaussianNoise,
    augmentDataset:     augmentDataset,
  });
})();
