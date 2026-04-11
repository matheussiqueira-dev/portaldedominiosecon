/**
 * @fileoverview Testes unitários — sign-config.js
 *
 * Cobre SIGN_DEFINITIONS, CLASS_ORDER, ANIMATED_SIGNS, getSignMeta
 * e formatSignLabel sem dependências de browser.
 * Executar via: npx jest tests/sign-config.test.js
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

// ─── Shim do módulo ────────────────────────────────────────────────────────────

const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>");
global.window = dom.window;

require("../sign-config.js");

const {
  OTHER_LABEL,
  CLASS_ORDER,
  ANIMATED_SIGNS,
  SIGN_DEFINITIONS,
  PALETTE,
  getSignMeta,
  formatSignLabel,
} = global.window.DomainExpansionSignConfig;

// ─── Estrutura de dados ────────────────────────────────────────────────────────

describe("SIGN_DEFINITIONS", () => {
  const EXPECTED_KEYS = ["infinite_void", "shrine", "red", "mahoraga", "other"];

  test("contém exatamente as 5 chaves esperadas", () => {
    expect(Object.keys(SIGN_DEFINITIONS).sort()).toEqual(EXPECTED_KEYS.sort());
  });

  test("cada definição possui as propriedades obrigatórias", () => {
    const required = ["key", "label", "shortLabel", "subtitle", "description", "accent", "lightAccent", "animated"];
    for (const key of EXPECTED_KEYS) {
      const def = SIGN_DEFINITIONS[key];
      for (const prop of required) {
        expect(def).toHaveProperty(prop);
      }
    }
  });

  test("a propriedade 'animated' é booleana em todas as definições", () => {
    for (const key of Object.keys(SIGN_DEFINITIONS)) {
      expect(typeof SIGN_DEFINITIONS[key].animated).toBe("boolean");
    }
  });

  test("somente 'other' tem animated = false", () => {
    expect(SIGN_DEFINITIONS.other.animated).toBe(false);
    const animated = Object.keys(SIGN_DEFINITIONS).filter((k) => SIGN_DEFINITIONS[k].animated);
    expect(animated).not.toContain("other");
  });

  test("accent é uma string HEX válida", () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    for (const key of Object.keys(SIGN_DEFINITIONS)) {
      expect(SIGN_DEFINITIONS[key].accent).toMatch(hexPattern);
    }
  });

  test("lightAccent é uma string rgba válida", () => {
    const rgbaPattern = /^rgba\(\d+,\s*\d+,\s*\d+,\s*[\d.]+\)$/;
    for (const key of Object.keys(SIGN_DEFINITIONS)) {
      expect(SIGN_DEFINITIONS[key].lightAccent).toMatch(rgbaPattern);
    }
  });

  test("o objeto é congelado (imutável)", () => {
    expect(Object.isFrozen(SIGN_DEFINITIONS)).toBe(true);
  });

  test("cada definição individual é congelada", () => {
    for (const key of Object.keys(SIGN_DEFINITIONS)) {
      expect(Object.isFrozen(SIGN_DEFINITIONS[key])).toBe(true);
    }
  });
});

// ─── CLASS_ORDER ───────────────────────────────────────────────────────────────

describe("CLASS_ORDER", () => {
  test("é um array", () => {
    expect(Array.isArray(CLASS_ORDER)).toBe(true);
  });

  test("termina com OTHER_LABEL", () => {
    expect(CLASS_ORDER[CLASS_ORDER.length - 1]).toBe(OTHER_LABEL);
  });

  test("todas as chaves existem em SIGN_DEFINITIONS", () => {
    for (const key of CLASS_ORDER) {
      expect(SIGN_DEFINITIONS).toHaveProperty(key);
    }
  });

  test("não contém duplicatas", () => {
    expect(new Set(CLASS_ORDER).size).toBe(CLASS_ORDER.length);
  });

  test("é congelado (imutável)", () => {
    expect(Object.isFrozen(CLASS_ORDER)).toBe(true);
  });
});

// ─── ANIMATED_SIGNS ───────────────────────────────────────────────────────────

describe("ANIMATED_SIGNS", () => {
  test("é um subconjunto de CLASS_ORDER", () => {
    for (const key of ANIMATED_SIGNS) {
      expect(CLASS_ORDER).toContain(key);
    }
  });

  test("não contém 'other'", () => {
    expect(ANIMATED_SIGNS).not.toContain(OTHER_LABEL);
  });

  test("todos os itens têm animated = true nas definições", () => {
    for (const key of ANIMATED_SIGNS) {
      expect(SIGN_DEFINITIONS[key].animated).toBe(true);
    }
  });

  test("é congelado (imutável)", () => {
    expect(Object.isFrozen(ANIMATED_SIGNS)).toBe(true);
  });
});

// ─── OTHER_LABEL ───────────────────────────────────────────────────────────────

describe("OTHER_LABEL", () => {
  test("é a string 'other'", () => {
    expect(OTHER_LABEL).toBe("other");
  });
});

// ─── PALETTE ──────────────────────────────────────────────────────────────────

describe("PALETTE", () => {
  test("é congelado", () => {
    expect(Object.isFrozen(PALETTE)).toBe(true);
  });

  test("contém a chave 'cyan'", () => {
    expect(PALETTE).toHaveProperty("cyan");
  });
});

// ─── getSignMeta ───────────────────────────────────────────────────────────────

describe("getSignMeta", () => {
  test("retorna a definição correta para uma chave válida", () => {
    const meta = getSignMeta("shrine");
    expect(meta.key).toBe("shrine");
    expect(meta.label).toBe("Santuário");
  });

  test("retorna um fallback para chave desconhecida", () => {
    const meta = getSignMeta("foo_bar");
    expect(meta).toBeDefined();
    expect(meta.key).toBe("foo_bar");
    expect(meta.animated).toBe(false);
  });

  test("fallback para undefined retorna chave com OTHER_LABEL", () => {
    const meta = getSignMeta(undefined);
    expect(meta.key).toBe(OTHER_LABEL);
  });

  test("nunca retorna null ou undefined", () => {
    const cases = [undefined, null, "", "nonexistent", "infinite_void", "other"];
    for (const c of cases) {
      expect(getSignMeta(c)).not.toBeNull();
      expect(getSignMeta(c)).not.toBeUndefined();
    }
  });

  test("retorna o mesmo objeto que SIGN_DEFINITIONS para chaves conhecidas", () => {
    for (const key of Object.keys(SIGN_DEFINITIONS)) {
      expect(getSignMeta(key)).toStrictEqual(SIGN_DEFINITIONS[key]);
    }
  });
});

// ─── formatSignLabel ──────────────────────────────────────────────────────────

describe("formatSignLabel", () => {
  test("retorna string não vazia para chave válida", () => {
    expect(typeof formatSignLabel("mahoraga")).toBe("string");
    expect(formatSignLabel("mahoraga").length).toBeGreaterThan(0);
  });

  test("retorna label de fallback para chave inexistente", () => {
    const label = formatSignLabel("unknownKey");
    expect(typeof label).toBe("string");
    expect(label).toBe("unknownKey");
  });

  test("é consistente com getSignMeta(key).label", () => {
    for (const key of CLASS_ORDER) {
      expect(formatSignLabel(key)).toBe(getSignMeta(key).label);
    }
  });
});
