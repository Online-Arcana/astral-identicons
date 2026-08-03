import { chromium } from "playwright-core";

const base = "https://kitty-crow.github.io/astral-identicons/";
const signFields = [
  "solar",
  "lunar",
  "ascendant",
  "midheaven",
  "descendant",
  "imumCoeli"
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/usr/bin/google-chrome-stable",
  args: ["--no-sandbox"]
});

try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  });

  const errors = [];

  page.on("pageerror", (error) => {
    errors.push(`pageerror: ${error.message}`);
  });

  page.on("response", (response) => {
    if (response.status() < 400) return;
    if (new URL(response.url()).pathname.endsWith("/favicon.ico")) return;
    errors.push(`http ${response.status()}: ${response.url()}`);
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

  const previewElement = page.locator("#preview");
  await page.waitForSelector("#preview > svg", { timeout: 15_000 });

  const preview = await previewElement.boundingBox();
  if (!preview) throw new Error("preview is not visible");

  if (preview.width > 300 || preview.width > 390) {
    throw new Error(`preview is too wide at ${preview.width}px`);
  }

  const expectedSeed = await page.locator("#status").textContent().then((text) => {
    const match = text?.match(/Visual seed ([0-9A-F]{64})/);
    if (!match) throw new Error("could not read the expected visual seed");
    return match[1];
  });

  const expectedSigns = Object.fromEntries(await Promise.all(
    signFields.map(async (field) => {
      return [field, await page.locator(`#${field}`).inputValue()];
    })
  ));

  const identicon = await previewElement.screenshot({ type: "png" });

  await page.locator("#scan").click();
  await page.waitForFunction(() => {
    const dialog = document.querySelector("#scan-dialog");
    return dialog instanceof HTMLDialogElement && dialog.open;
  }, undefined, { timeout: 10_000 });

  await page.waitForFunction(() => {
    const status = document.querySelector("#scan-status")?.textContent ?? "";
    return status.includes("Camera ready");
  }, undefined, { timeout: 10_000 });

  await page.locator("#scan-file").setInputFiles({
    name: "generated-identicon.png",
    mimeType: "image/png",
    buffer: identicon
  });

  const statusLocator = page.locator("#scan-status");
  let previous = "";
  let final = "";
  let failed = false;
  const started = Date.now();

  while (Date.now() - started < 60_000) {
    const status = (await statusLocator.textContent()) ?? "";
    const classes = (await statusLocator.getAttribute("class")) ?? "";

    if (status !== previous) {
      console.log(`scanner-status=${status}`);
      previous = status;
    }

    if (status.startsWith("Seed ")) {
      final = status;
      break;
    }

    if (classes.includes("error")) {
      await page.waitForTimeout(150);
      final = (await statusLocator.textContent()) ?? status;
      failed = true;
      break;
    }

    await page.waitForTimeout(250);
  }

  console.log(`preview=${preview.width}x${preview.height}`);
  console.log(`elapsed=${Date.now() - started}ms`);

  if (!final) {
    throw new Error(`decoder remained pending at: ${previous}`);
  }

  if (failed) {
    throw new Error(`decoder failed at: ${final}`);
  }

  const recoveredSeed = await page.locator("#seed").inputValue();
  if (recoveredSeed !== expectedSeed) {
    throw new Error(
      `recovered seed ${recoveredSeed} does not match ${expectedSeed}`
    );
  }

  for (const field of signFields) {
    const recovered = await page.locator(`#${field}`).inputValue();
    if (recovered === expectedSigns[field]) continue;

    throw new Error(
      `recovered ${field}=${recovered}, expected ${expectedSigns[field]}`
    );
  }

  if (errors.length > 0) {
    throw new Error(errors.join(" | "));
  }

  console.log(`scanner-result=${final}`);
} finally {
  await browser.close();
}
