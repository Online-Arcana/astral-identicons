import { chromium, webkit } from "playwright";

const base = "https://kitty-crow.github.io/astral-identicons/";
const engines = [
  ["chromium", chromium],
  ["webkit", webkit]
];

for (const [name, engine] of engines) {
  const browser = await engine.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    errors.push(`console: ${message.text()}`);
  });

  await page.addInitScript(() => {
    const media = {
      async getUserMedia() {
        return {
          getTracks() {
            return [];
          }
        };
      }
    };

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: media
    });

    Object.defineProperty(HTMLMediaElement.prototype, "srcObject", {
      configurable: true,
      get() {
        return this.__testStream;
      },
      set(value) {
        this.__testStream = value;
      }
    });

    HTMLMediaElement.prototype.play = async function play() {};
  });

  await page.goto(`${base}?browser-diagnostic=${Date.now()}`, {
    waitUntil: "networkidle",
    timeout: 30_000
  });

  await page.waitForSelector("#preview > svg", { timeout: 15_000 });

  const preview = await page.locator("#preview").boundingBox();
  if (!preview) throw new Error(`${name}: preview is not visible`);

  if (preview.width > 300 || preview.width > 390) {
    throw new Error(`${name}: preview is too wide at ${preview.width}px`);
  }

  await page.locator("#scan").click();
  await page.waitForFunction(() => {
    const dialog = document.querySelector("#scan-dialog");
    return dialog instanceof HTMLDialogElement && dialog.open;
  }, undefined, { timeout: 10_000 });

  await page.waitForFunction(() => {
    const status = document.querySelector("#scan-status")?.textContent ?? "";
    return status.includes("Keep the complete outer circle inside the guide");
  }, undefined, { timeout: 10_000 });

  const status = await page.locator("#scan-status").textContent();
  console.log(`${name}: preview=${preview.width}x${preview.height}`);
  console.log(`${name}: scanner-status=${status}`);

  if (errors.length > 0) {
    throw new Error(`${name}: ${errors.join(" | ")}`);
  }

  await browser.close();
}
