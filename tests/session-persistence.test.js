/**
 * @fileoverview Testes unitários — session-persistence.js
 *
 * Cobre saveSession, loadSession, clearSession e getSessionMeta
 * usando um mock de localStorage em ambiente Node.js.
 * Executar via: npx jest tests/session-persistence.test.js
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

// ─── Mock de localStorage ─────────────────────────────────────────────────────

const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
global.window    = dom.window;
global.localStorage = dom.window.localStorage;

require("../session-persistence.js");

const { saveSession, loadSession, clearSession, getSessionMeta, isAvailable } =
  global.window.DomainExpansionSessionPersistence;

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeDataset(size = 10) {
  const X = Array.from({ length: size }, () => new Array(126).fill(0).map(() => Math.random()));
  const y = Array.from({ length: size }, (_, i) => i % 5);
  const classCounts = { infinite_void: 2, shrine: 2, red: 2, mahoraga: 2, other: 2 };
  return { X, y, classCounts };
}

// ─── isAvailable ──────────────────────────────────────────────────────────────

describe("isAvailable", () => {
  test("retorna true em ambiente com localStorage funcional", () => {
    expect(isAvailable()).toBe(true);
  });
});

// ─── saveSession / loadSession ────────────────────────────────────────────────

describe("saveSession + loadSession (round-trip)", () => {
  beforeEach(() => clearSession());

  test("salva e restaura um dataset corretamente", () => {
    const { X, y, classCounts } = makeDataset(20);
    const saveResult = saveSession(X, y, classCounts);
    expect(saveResult.ok).toBe(true);

    const loadResult = loadSession();
    expect(loadResult.ok).toBe(true);
    expect(loadResult.data.sampleCount).toBe(20);
    expect(loadResult.data.X).toHaveLength(20);
    expect(loadResult.data.y).toHaveLength(20);
  });

  test("dados numéricos são preservados com fidelidade", () => {
    const { X, y, classCounts } = makeDataset(5);
    saveSession(X, y, classCounts);
    const { data } = loadSession();
    for (let i = 0; i < X.length; i++) {
      for (let j = 0; j < X[i].length; j++) {
        expect(data.X[i][j]).toBeCloseTo(X[i][j], 10);
      }
    }
  });

  test("savedAt é uma string de data ISO válida", () => {
    const { X, y, classCounts } = makeDataset(5);
    saveSession(X, y, classCounts);
    const { data } = loadSession();
    expect(() => new Date(data.savedAt)).not.toThrow();
    expect(isNaN(new Date(data.savedAt).getTime())).toBe(false);
  });

  test("retorna erro ao carregar quando não há sessão salva", () => {
    const result = loadSession();
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  test("retorna erro ao salvar com arrays de tamanhos diferentes", () => {
    const result = saveSession([[1, 2]], [1, 2], {});
    expect(result.ok).toBe(false);
  });

  test("retorna erro ao salvar com null em X ou y", () => {
    expect(saveSession(null, [], {}).ok).toBe(false);
    expect(saveSession([], null, {}).ok).toBe(false);
  });
});

// ─── clearSession ─────────────────────────────────────────────────────────────

describe("clearSession", () => {
  test("após clear, loadSession retorna erro", () => {
    const { X, y, classCounts } = makeDataset(5);
    saveSession(X, y, classCounts);
    clearSession();
    const result = loadSession();
    expect(result.ok).toBe(false);
  });

  test("clear em sessão inexistente não lança exceção", () => {
    expect(() => clearSession()).not.toThrow();
  });
});

// ─── getSessionMeta ───────────────────────────────────────────────────────────

describe("getSessionMeta", () => {
  beforeEach(() => clearSession());

  test("retorna metadados corretos após save", () => {
    const { X, y, classCounts } = makeDataset(15);
    saveSession(X, y, classCounts);
    const result = getSessionMeta();
    expect(result.ok).toBe(true);
    expect(result.meta.sampleCount).toBe(15);
    expect(result.meta.savedAt).toBeTruthy();
  });

  test("retorna erro se não houver sessão", () => {
    const result = getSessionMeta();
    expect(result.ok).toBe(false);
  });
});
