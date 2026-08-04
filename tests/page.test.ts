import { describe, expect, test } from "bun:test";
import { page } from "../src/page.ts";

const source = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
</head>
<body>
  <script type="module" src="/app.js"></script>
</body>
</html>`;

describe("responsive page assets", () => {
  test("unlocks the viewport and resolves deployable asset paths", () => {
    const result = page(source, {
      script: "./app.hash.js",
      stylesheet: "./responsive.css",
      opencv: "./vendor/opencv.hash.js"
    });

    expect(result).toContain(
      'content="width=device-width, initial-scale=1, viewport-fit=cover"'
    );
    expect(result).not.toContain("maximum-scale=1");
    expect(result).not.toContain("user-scalable=no");
    expect(result).toContain(
      '<link rel="stylesheet" href="./responsive.css">'
    );
    expect(result).toContain(
      '<script id="opencv-runtime" src="./vendor/opencv.hash.js" async></script>'
    );
    expect(result).toContain('src="./app.hash.js"');
  });

  test("keeps OpenCV optional for non-scanner pages", () => {
    const result = page(source, {
      script: "/app.js",
      stylesheet: "/responsive.css"
    });

    expect(result).not.toContain("opencv-runtime");
  });

  test("fails when the expected source contract changes", () => {
    let message = "";

    try {
      page("<html><head></head><body></body></html>", {
        script: "/app.js",
        stylesheet: "/responsive.css"
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain("locked viewport");
  });
});
