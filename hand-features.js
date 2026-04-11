/**
 * @fileoverview Extração e normalização de features de landmarks de mãos.
 *
 * Converte os 21 pontos de cada mão (formato MediaPipe) em vetores
 * normalizados de comprimento fixo, garantindo estabilidade do tensor
 * de entrada independente de posição, escala ou ausência de mão.
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

(function () {
  "use strict";

  /** Número de landmarks por mão (MediaPipe Hands). */
  var LANDMARK_COUNT = 21;

  /** Dimensões por landmark (x, y, z). */
  var DIMS = 3;

  /** Tamanho do vetor normalizado por mão. */
  var FEATURES_PER_HAND = LANDMARK_COUNT * DIMS; // 63

  /** Tamanho total do vetor de entrada (duas mãos). */
  var TOTAL_FEATURES = FEATURES_PER_HAND * 2; // 126

  /** Escala mínima para evitar divisão por zero. */
  var MIN_SCALE = 1e-6;

  /**
   * Valida se um array de landmarks possui a estrutura esperada.
   *
   * @param {Array} landmarks - Array de objetos com propriedades {x, y, z}.
   * @returns {boolean} true se válido.
   */
  function isValidLandmarks(landmarks) {
    if (!Array.isArray(landmarks) || landmarks.length !== LANDMARK_COUNT) {
      return false;
    }
    var wrist = landmarks[0];
    return (
      wrist !== null &&
      typeof wrist === "object" &&
      typeof wrist.x === "number" &&
      typeof wrist.y === "number" &&
      typeof wrist.z === "number"
    );
  }

  /**
   * Normaliza os landmarks de uma mão em relação ao pulso e escala pela
   * distância pulso–ponta do dedo médio.
   *
   * A normalização torna o vetor invariante a translação e escala,
   * permitindo que o modelo generalize independente do tamanho da mão
   * ou da distância à câmera.
   *
   * @param {Array<{x: number, y: number, z: number}>} landmarks
   *   21 landmarks no formato MediaPipe Hands.
   * @returns {number[]} Vetor de 63 valores normalizados [x0,y0,z0, x1,y1,z1, …].
   * @throws {TypeError} Se `landmarks` não for um array válido de 21 pontos.
   */
  function normalizeHand(landmarks) {
    if (!isValidLandmarks(landmarks)) {
      throw new TypeError(
        "normalizeHand: esperado array de " +
          LANDMARK_COUNT +
          " landmarks com propriedades {x, y, z}."
      );
    }

    var wrist = landmarks[0];
    var midTip = landmarks[12];

    var scale = Math.hypot(
      midTip.x - wrist.x,
      midTip.y - wrist.y,
      midTip.z - wrist.z
    );

    // Garante denominador seguro mesmo em poses degeneradas.
    if (scale < MIN_SCALE) {
      scale = MIN_SCALE;
    }

    var out = new Array(FEATURES_PER_HAND);
    for (var i = 0; i < LANDMARK_COUNT; i += 1) {
      var p = landmarks[i];
      var base = i * DIMS;
      out[base] = (p.x - wrist.x) / scale;
      out[base + 1] = (p.y - wrist.y) / scale;
      out[base + 2] = (p.z - wrist.z) / scale;
    }

    return out;
  }

  /**
   * Constrói um vetor de features de comprimento fixo (126) combinando
   * a mão esquerda e a mão direita detectadas pelo MediaPipe Hands.
   *
   * A estrutura do vetor é sempre [esquerda(63) | direita(63)].
   * Mãos não detectadas são preenchidas com zeros, mantendo a forma do
   * tensor de entrada estável para o modelo TensorFlow.js.
   *
   * @param {object} results - Objeto de resultados do MediaPipe Hands,
   *   com as propriedades `multiHandLandmarks` e `multiHandedness`.
   * @returns {number[]} Vetor de 126 números em ponto flutuante.
   */
  function getTwoHandFeatures(results) {
    var left = new Array(FEATURES_PER_HAND).fill(0);
    var right = new Array(FEATURES_PER_HAND).fill(0);

    if (!results || !Array.isArray(results.multiHandLandmarks)) {
      return left.concat(right);
    }

    var lms = results.multiHandLandmarks;
    var handed = results.multiHandedness || [];

    for (var i = 0; i < lms.length; i += 1) {
      var side = handed[i] && handed[i].label;

      if (!isValidLandmarks(lms[i])) {
        console.warn(
          "getTwoHandFeatures: landmarks inválidos no índice " + i + ". Ignorando."
        );
        continue;
      }

      try {
        var f = normalizeHand(lms[i]);
        if (side === "Left") {
          left = f;
        } else if (side === "Right") {
          right = f;
        }
      } catch (err) {
        console.warn("getTwoHandFeatures: falha ao normalizar mão " + side + ".", err);
      }
    }

    return left.concat(right);
  }

  // ─── Exportação pública ────────────────────────────────────────────────────

  window.DomainExpansionGestureFeatures = Object.freeze({
    /** @see normalizeHand */
    normalizeHand: normalizeHand,
    /** @see getTwoHandFeatures */
    getTwoHandFeatures: getTwoHandFeatures,
    /** Constantes de forma do tensor, úteis em validações externas. */
    FEATURES_PER_HAND: FEATURES_PER_HAND,
    TOTAL_FEATURES: TOTAL_FEATURES,
    LANDMARK_COUNT: LANDMARK_COUNT,
  });
})();
