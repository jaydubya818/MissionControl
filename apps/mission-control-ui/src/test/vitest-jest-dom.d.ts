import "@types/testing-library__jest-dom";
import "vitest";

declare module "vitest" {
  interface Assertion<T = unknown> extends jest.Matchers<void, T> {}

  interface AsymmetricMatchersContaining extends jest.Matchers<void, unknown> {}
}
