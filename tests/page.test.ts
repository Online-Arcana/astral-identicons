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
  test("unlocks the viewport and resolves self-contained asset paths", () => {
    const result = page(source, {
      script: "./app.hash.js",
      stylesheet: "./responsive.css"
    });

    expect(result).toContain(
      'content="width=device-width, initial-scale=1, viewport-fit=cover"'
    );
    expect(result).not.toContain("maximum-scale=1");
    expect(result).not.toContain("user-scalable=no");
    expect(result).toContain(
      '<link rel="stylesheet" href="./responsive.css">'
    );
    expect(result).toContain('src="./app.hash.js"');
    expect(result).not.toContain("opencv-runtime");
    expect(result).not.toContain("opencv.js");
    expect(result).not.toContain("cdn");
  });

  test("escapes generated asset attributes", () => {
    const result = page(source, {
      script: './app.js?x="bad"&y=1',
      stylesheet: "./responsive.css?x=1&y=2"
    });

    expect(result).toContain('src="./app.js?x=&quot;bad&quot;&amp;y=1"');
    expect(result).toContain(
      'href="./responsive.css?x=1&amp;y=2"'
    );
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
