export function installFormatStatus(scannerVersion: number): void {
  if (typeof document === "undefined") return;

  const install = (): void => {
    const preview = document.querySelector<HTMLElement>("#preview");
    const status = document.querySelector<HTMLParagraphElement>("#status");
    if (!preview || !status) return;

    const update = (): void => {
      const svg = preview.querySelector<SVGSVGElement>("svg");
      const record = Number(svg?.dataset.codeVersion ?? "0");
      const visual = Number(svg?.dataset.visualVersion ?? "0");
      if (record !== 9) return;

      if (visual === 10) {
        const scanner = scannerVersion === 10
          ? "Scanner v10 is active."
          : `Scanner v${scannerVersion} is selected for legacy testing instead of the current v10 camera path.`;
        status.textContent = [
          "V10 uses the astrology chart wheel as the visual frame.",
          "The key-derived palette colours the wheel.",
          "The Solar constellation and one hundred and twenty-eight RS(168,40) parity stars occupy the area normally used for aspect lines.",
          "The old encoded planets, satellites, centre sign grid, separate identicon zodiac ring and calibration stars are not drawn.",
          "The parity stars alone can reconstruct the exact 32-byte identity and all six signs; colour and natal chart glyphs are ignored during identity decoding.",
          scanner
        ].join(" ");
        status.className = "status";
        return;
      }

      const scanner = scannerVersion === 9
        ? "Scanner v9 is active."
        : `Scanner v${scannerVersion} is active; use ?scanner=v9 to test the legacy v9 camera path.`;
      status.textContent = [
        "Legacy v9 encodes the exact 32-byte identity through eleven planetary glyphs and thirty-three satellites.",
        "The six signs remain literal.",
        "One hundred and twenty-eight indexed stars contain RS(168,40) parity only.",
        "Twelve fixed circumference stars calibrate orientation, star size and fading; the twelve Sun rays calibrate fading only.",
        "Colour is decorative and ignored during decoding.",
        scanner
      ].join(" ");
      status.className = "status";
    };

    new MutationObserver(update).observe(preview, {
      childList: true,
      subtree: false
    });
    update();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
    return;
  }
  install();
}
