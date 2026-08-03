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
    const diagnostic = await page.evaluate(() => {
      const canvas = document.querySelector("#scan-normalised");
      const svg = document.querySelector("#preview > svg");
      if (!(canvas instanceof HTMLCanvasElement) || !(svg instanceof SVGElement)) {
        return { error: "missing diagnostic canvas or SVG" };
      }

      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return { error: "missing diagnostic canvas context" };

      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const backgroundHex = svg.querySelector("#background")?.getAttribute("fill") ?? "#000";
      const layer1Hex = svg.querySelector("#ring-outer")?.getAttribute("stroke") ?? "#FFF";
      const groups = [...svg.querySelectorAll("#coded-stars [data-code-slot]")];
      const expected = groups.map((group) => ({
        slot: Number(group.getAttribute("data-code-slot")),
        value: Number.parseInt(group.getAttribute("data-code-value") ?? "0", 16)
      })).sort((left, right) => left.slot - right.slot);

      const reduced = (hex) => {
        const digits = hex.slice(1).split("");
        return {
          r: Number.parseInt(digits[0] + digits[0], 16),
          g: Number.parseInt(digits[1] + digits[1], 16),
          b: Number.parseInt(digits[2] + digits[2], 16)
        };
      };

      const background = reduced(backgroundHex);
      const target = reduced(layer1Hex);
      const centre = 512;
      const innerClipRadius = 384;
      const starCodeRadius = innerClipRadius - 54;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));

      const pixel = (x, y) => {
        const column = Math.max(0, Math.min(image.width - 1, Math.round(x)));
        const row = Math.max(0, Math.min(image.height - 1, Math.round(y)));
        const index = (row * image.width + column) * 4;
        return {
          r: image.data[index],
          g: image.data[index + 1],
          b: image.data[index + 2]
        };
      };

      const distance = (left, right) => Math.hypot(
        left.r - right.r,
        left.g - right.g,
        left.b - right.b
      );

      const evidence = (value) => {
        const red = target.r - background.r;
        const green = target.g - background.g;
        const blue = target.b - background.b;
        const length = red * red + green * green + blue * blue;
        if (length < 1) return 0;

        const projection = (
          (value.r - background.r) * red +
          (value.g - background.g) * green +
          (value.b - background.b) * blue
        ) / length;

        const projected = {
          r: background.r + red * projection,
          g: background.g + green * projection,
          b: background.b + blue * projection
        };

        const perpendicular = distance(value, projected) / 255;
        return Math.max(0, Math.min(1, projection - perpendicular * 1.7));
      };

      const slotPoint = (slot, value) => {
        const fraction = (slot + 0.5) / 96;
        const radius = 42 + Math.sqrt(fraction) * (starCodeRadius - 42);
        const angle = slot * goldenAngle - Math.PI / 2;
        const baseX = centre + Math.cos(angle) * radius;
        const baseY = centre + Math.sin(angle) * radius;
        const column = value >>> 2;
        const row = value & 3;
        return {
          x: baseX + (column - 1.5) * 8,
          y: baseY + (row - 1.5) * 8
        };
      };

      const transform = (point, angle, scale) => {
        const radians = angle * Math.PI / 180;
        const x = (point.x - centre) * scale;
        const y = (point.y - centre) * scale;
        return {
          x: centre + x * Math.cos(radians) - y * Math.sin(radians),
          y: centre + x * Math.sin(radians) + y * Math.cos(radians)
        };
      };

      const strongest = (point, radius = 3) => {
        const values = [];
        for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
          for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
            if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
            values.push(evidence(pixel(point.x + offsetX, point.y + offsetY)));
          }
        }
        values.sort((left, right) => right - left);
        const count = Math.max(2, Math.round(values.length * 0.16));
        return values.slice(0, count).reduce((sum, value) => sum + value, 0) / count;
      };

      const transformScore = (angle, scale) => {
        let total = 0;
        let hits = 0;
        for (const symbol of expected) {
          const point = transform(slotPoint(symbol.slot, symbol.value), angle, scale);
          const score = strongest(point);
          total += score;
          if (score >= 0.2) hits += 1;
        }
        return { angle, scale, average: total / Math.max(1, expected.length), hits };
      };

      let best = transformScore(0, 1);
      for (let angle = 0; angle < 360; angle += 5) {
        for (let scale = 0.8; scale <= 1.2; scale += 0.025) {
          const candidate = transformScore(angle, scale);
          if (candidate.average <= best.average) continue;
          best = candidate;
        }
      }

      const refined = [];
      for (let angle = best.angle - 5; angle <= best.angle + 5; angle += 0.5) {
        for (let scale = best.scale - 0.04; scale <= best.scale + 0.04; scale += 0.005) {
          refined.push(transformScore(angle, scale));
        }
      }
      refined.sort((left, right) => right.average - left.average);
      best = refined[0] ?? best;

      const classify = (angle, scale) => {
        let confident = 0;
        let correct = 0;
        const details = [];

        for (const symbol of expected) {
          const scores = Array.from({ length: 16 }, (_unused, value) => {
            const point = transform(slotPoint(symbol.slot, value), angle, scale);
            return { value, score: strongest(point) };
          }).sort((left, right) => right.score - left.score);

          const first = scores[0];
          const second = scores[1];
          const margin = first.score - second.score;
          const accepted = first.score >= 0.12 && margin >= 0.035;
          if (accepted) confident += 1;
          if (accepted && first.value === symbol.value) correct += 1;
          if (details.length < 12) {
            details.push({
              slot: symbol.slot,
              expected: symbol.value,
              observed: first.value,
              score: Number(first.score.toFixed(3)),
              margin: Number(margin.toFixed(3)),
              accepted
            });
          }
        }

        return { confident, correct, details };
      };

      return {
        codeVersion: svg.getAttribute("data-code-version"),
        codeSymbols: expected.length,
        backgroundHex,
        layer1Hex,
        canonical: transformScore(0, 1),
        best,
        canonicalClassification: classify(0, 1),
        bestClassification: classify(best.angle, best.scale)
      };
    });

    console.log(`star-diagnostic=${JSON.stringify(diagnostic)}`);
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
