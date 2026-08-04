export function installFormatStatus(scannerVersion: number): void {
  if (typeof document === "undefined") return;

  const install = (): void => {
    const preview = document.querySelector<HTMLElement>("#preview");
    const status = document.querySelector<HTMLParagraphElement>("#status");
    if (!preview || !status) return;

    const update = (): void => {
      const svg = preview.querySelector<SVGSVGElement>("svg");
      const format = Number(svg?.dataset.codeVersion ?? "0");
      if (format !== 9) return;

      const scanner = scannerVersion === 9
        ? "Scanner v9 is active."
        : `Scanner v${scannerVersion} remains active and does not claim v9 camera support yet.`;
      status.textContent = [
        "V9 encodes the exact 32-byte identity through eleven planetary glyphs and thirty-three satellites.",
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
