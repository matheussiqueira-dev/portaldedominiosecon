/**
 * @fileoverview Testes unitários — hand-features.js
 *
 * Cobre normalizeHand e getTwoHandFeatures sem dependências externas.
 * Executar via: npx jest tests/hand-features.test.js
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

// ─── Shim do módulo para ambiente Node.js ─────────────────────────────────────

// hand-features.js exporta via window.DomainExpansionGestureFeatures.
// Simulamos o global `window` para carregar o módulo sem browser.
const { JSDOM } = require("jsdom");
const dom  = new JSDOM("<!DOCTYPE html><html><body></body></html>");
global.window = dom.window;

require("../hand-features.js");

const { normalizeHand, getTwoHandFeatures, FEATURES_PER_HAND, TOTAL_FEATURES, LANDMARK_COUNT } =
  global.window.DomainExpansionGestureFeatures;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Gera 21 landmarks fictícios com valores controlados.
 * @param {number} offsetX - Translação em x (testa invariância à translação).
 * @param {number} scale   - Escala global (testa invariância à escala).
 * @returns {Array<{x: number, y: number, z: number}>}
 */
function makeLandmarks(offsetX = 0, scale = 1) {
  const lms = [];
  for (let i = 0; i < 21; i++) {
    lms.push({
      x: (i * 0.05 + offsetX) * scale,
      y: (i * 0.03)           * scale,
      z: (i * 0.01)           * scale,
    });
  }
  return lms;
}

/**
 * Gera um objeto de resultados MediaPipe com N mãos.
 * @param {Array<{label: string, landmarks: Array}>} hands
 */
function makeResults(hands) {
  return {
    multiHandLandmarks: hands.map((h) => h.landmarks),
    multiHandedness:    hands.map((h) => ({ label: h.label })),
  };
}

// ─── normalizeHand ─────────────────────────────────────────────────────────────

describe("normalizeHand", () => {
  test("retorna um array de 63 valores", () => {
    const out = normalizeHand(makeLandmarks());
    expect(out).toHaveLength(FEATURES_PER_HAND); // 63
  });

  test("o wrist normalizado é [0, 0, 0]", () => {
    const out = normalizeHand(makeLandmarks());
    expect(out[0]).toBeCloseTo(0);
    expect(out[1]).toBeCloseTo(0);
    expect(out[2]).toBeCloseTo(0);
  });

  test("invariante à translação: mesmo vetor com ou sem offset", () => {
    const base   = normalizeHand(makeLandmarks(0));
    const offset = normalizeHand(makeLandmarks(10));
    for (let i = 0; i < base.length; i++) {
      expect(offset[i]).toBeCloseTo(base[i], 5);
    }
  });

  test("invariante à escala: mesmo vetor com scale 1 e scale 3", () => {
    const s1 = normalizeHand(makeLandmarks(0, 1));
    const s3 = normalizeHand(makeLandmarks(0, 3));
    for (let i = 0; i < s1.length; i++) {
      expect(s3[i]).toBeCloseTo(s1[i], 5);
    }
  });

  test("lança TypeError para array com menos de 21 landmarks", () => {
    const short = makeLandmarks().slice(0, 10);
    expect(() => normalizeHand(short)).toThrow(TypeError);
  });

  test("lança TypeError para null", () => {
    expect(() => normalizeHand(null)).toThrow(TypeError);
  });

  test("lança TypeError para landmark sem propriedades {x, y, z}", () => {
    const bad = makeLandmarks();
    bad[0] = { x: 0 }; // missing y, z
    expect(() => normalizeHand(bad)).toThrow(TypeError);
  });

  test("não explode com escala zero (landmarks colapsados no wrist)", () => {
    const collapsed = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    const out = normalizeHand(collapsed);
    expect(out).toHaveLength(FEATURES_PER_HAND);
    // Com scale = MIN_SCALE todos os valores devem ser 0 (wrist já está em 0).
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

// ─── getTwoHandFeatures ────────────────────────────────────────────────────────

describe("getTwoHandFeatures", () => {
  test("retorna array de 126 valores", () => {
    const results = makeResults([
      { label: "Left",  landmarks: makeLandmarks() },
      { label: "Right", landmarks: makeLandmarks(1) },
    ]);
    const out = getTwoHandFeatures(results);
    expect(out).toHaveLength(TOTAL_FEATURES); // 126
  });

  test("retorna zeros para resultados sem mãos", () => {
    const out = getTwoHandFeatures({ multiHandLandmarks: [], multiHandedness: [] });
    expect(out).toHaveLength(TOTAL_FEATURES);
    expect(out.every((v) => v === 0)).toBe(true);
  });

  test("retorna zeros para resultados nulos/undefined", () => {
    expect(getTwoHandFeatures(null)).toHaveLength(TOTAL_FEATURES);
    expect(getTwoHandFeatures(undefined)).toHaveLength(TOTAL_FEATURES);
  });

  test("a metade esquerda [0-62] fica zerada quando só há mão direita", () => {
    const results = makeResults([{ label: "Right", landmarks: makeLandmarks() }]);
    const out = getTwoHandFeatures(results);
    const left  = out.slice(0, 63);
    const right = out.slice(63, 126);
    expect(left.every((v) => v === 0)).toBe(true);
    expect(right.some((v) => v !== 0)).toBe(true);
  });

  test("a metade direita [63-125] fica zerada quando só há mão esquerda", () => {
    const results = makeResults([{ label: "Left", landmarks: makeLandmarks() }]);
    const out = getTwoHandFeatures(results);
    const left  = out.slice(0, 63);
    const right = out.slice(63, 126);
    expect(left.some((v) => v !== 0)).toBe(true);
    expect(right.every((v) => v === 0)).toBe(true);
  });

  test("dois pares distintos de mãos produzem vetores distintos", () => {
    const r1 = makeResults([{ label: "Right", landmarks: makeLandmarks(0) }]);
    const r2 = makeResults([{ label: "Right", landmarks: makeLandmarks(5) }]);
    const o1 = getTwoHandFeatures(r1);
    const o2 = getTwoHandFeatures(r2);
    // Invariante à translação, portanto devem ser iguais!
    for (let i = 0; i < o1.length; i++) {
      expect(o2[i]).toBeCloseTo(o1[i], 5);
    }
  });

  test("não lança exceção com landmarks inválidos — apenas emite warning", () => {
    const results = {
      multiHandLandmarks: [null, makeLandmarks()],
      multiHandedness:    [{ label: "Left" }, { label: "Right" }],
    };
    expect(() => getTwoHandFeatures(results)).not.toThrow();
    const out = getTwoHandFeatures(results);
    expect(out).toHaveLength(TOTAL_FEATURES);
  });

  test("constantes exportadas têm os valores corretos", () => {
    expect(LANDMARK_COUNT).toBe(21);
    expect(FEATURES_PER_HAND).toBe(63);
    expect(TOTAL_FEATURES).toBe(126);
  });
});
