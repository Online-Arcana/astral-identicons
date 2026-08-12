import { expect, test } from "bun:test";
import { renderAstralPackageIdenticon } from "../src/browser-api.js";

test("browser package API exposes the packaged-chart renderer", () => {
  expect(typeof renderAstralPackageIdenticon).toBe("function");
});
