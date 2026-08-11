import 'vitest';
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers';

/**
 * Matchers `jest-dom` (`toBeInTheDocument`, `toBeDisabled`…) déclarés pour
 * TypeScript. Ils sont ajoutés à l'exécution par `src/test/setup.ts` ; sans
 * cette déclaration, `tsc` les refuserait alors que les tests passent.
 */
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion<T = unknown> extends TestingLibraryMatchers<T, void> {}
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, void> {}
}
