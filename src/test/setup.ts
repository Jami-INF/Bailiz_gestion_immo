import { afterEach, expect, vi } from 'vitest';

/*
 * Setup commun aux deux environnements. Les tests `node` (logique métier) ne
 * doivent rien payer pour l'outillage DOM : tout ce qui touche à jsdom est donc
 * chargé dynamiquement, seulement quand un document existe.
 */
const avecDom = typeof document !== 'undefined';

if (avecDom) {
  // L'export par défaut porte les matchers ; l'interop ESM/CJS place parfois le
  // module lui-même à leur place.
  const module = await import('@testing-library/jest-dom/matchers');
  const { cleanup } = await import('@testing-library/react');
  expect.extend((module.default ?? module) as Parameters<typeof expect.extend>[0]);
  afterEach(() => cleanup());

  /*
   * jsdom n'implémente ni `matchMedia`, ni `scrollTo`, ni `ResizeObserver`,
   * tous appelés au montage de certains écrans. Sans ces bouchons, l'échec
   * porte sur l'outillage et masque le vrai comportement testé.
   */
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  window.HTMLElement.prototype.scrollIntoView = vi.fn();

  if (!('URL' in globalThis && typeof URL.createObjectURL === 'function')) {
    URL.createObjectURL = vi.fn(() => 'blob:test');
    URL.revokeObjectURL = vi.fn();
  }

  /*
   * jsdom n'expose pas `navigator.storage`. L'application y lit la persistance
   * et le quota ; sans support, elle doit rester silencieuse — c'est le
   * comportement par défaut installé ici, que les tests concernés remplacent
   * par un espion.
   */
  if (!navigator.storage) {
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: {},
    });
  }
  const stockage = navigator.storage as unknown as Record<string, unknown>;
  stockage.persisted ??= () => Promise.resolve(false);
  stockage.persist ??= () => Promise.resolve(false);
  stockage.estimate ??= () => Promise.resolve({ usage: 0, quota: 0 });
}

/**
 * Fige l'horloge **sans** toucher aux minuteurs.
 *
 * `useFakeTimers()` complet met en défaut `fake-indexeddb` et les attentes de
 * Testing Library, qui reposent sur de vrais `setTimeout` : les tests se
 * figeaient au lieu d'échouer proprement. Seul `Date` a besoin d'être
 * déterministe pour vérifier des échéances légales.
 */
export function figerDate(iso: string): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}
