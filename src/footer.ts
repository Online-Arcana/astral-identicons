export function installVersionFooter(
  appVersion: string,
  scannerVersion: number
): void {
  if (typeof document === "undefined") return;

  const install = (): void => {
    if (document.querySelector("#runtime-versions")) return;

    const footer = document.createElement("footer");
    footer.id = "runtime-versions";
    footer.setAttribute("aria-label", "Runtime versions");
    footer.textContent = `App ${appVersion} · Scanner v${scannerVersion}`;

    Object.assign(footer.style, {
      width: "100%",
      padding: "0.7rem max(1rem, env(safe-area-inset-right)) calc(0.7rem + env(safe-area-inset-bottom)) max(1rem, env(safe-area-inset-left))",
      color: "#888899",
      fontSize: "0.75rem",
      lineHeight: "1.4",
      textAlign: "center",
      letterSpacing: "0.02em"
    });

    document.body.append(footer);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
    return;
  }

  install();
}
