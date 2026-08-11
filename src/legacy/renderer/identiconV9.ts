import {
  escapeXml, identiconCanvas as canvas, identiconCentre as centre,
  identiconInnerRingRadius as innerRingRadius, identiconOuterRingRadius as outerRingRadius,
  identiconRingStroke as ringStroke, innerSigns, monochrome, nestedSvg, parseSvg, ringSigns,
  scopeIds, signAssets, signLabel,
} from "./identiconCommon.js";
import { calibrationStarsLayer, parityLayer, planetLayer, sunLayer, v9InnerClipRadius } from "./identiconV9Geometry.js";
import type { AstralIdenticonAssetSource, AstralIdenticonV9Request } from "./identiconTypes.js";

export async function renderAstralIdenticonV9(request: AstralIdenticonV9Request, assets: AstralIdenticonAssetSource): Promise<string> {
  const value = request.input;
  const planetaryColour = request.palette.layer0;
  const parityColour = request.palette.layer1;
  const background = request.palette.background;
  const layer0Radius = v9InnerClipRadius - 12;
  const layer0Size = layer0Radius * 2;
  const layer0X = centre - layer0Radius;
  const layer0Y = centre - layer0Radius;
  const constellation = parseSvg(await assets.constellation(value.solar));
  const constellationBody = monochrome(scopeIds(constellation.body, `solar-${value.solar}`), planetaryColour);
  const signs = await signAssets(value, assets);
  const title = `Astral identicon v9: ${signLabel(value.solar)} Sun, ${signLabel(value.lunar)} Moon`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}" role="img" aria-label="${escapeXml(title)}" data-input="${escapeXml(JSON.stringify(value))}" data-palette-index="${request.paletteIndex}" data-code-version="${request.recordVersion}" data-scannable="v9" data-identity-hex="${request.identityHex}">
  <title>${escapeXml(title)}</title>
  <metadata>Astral Identicon visual contract v9. Literal signs remain in the constellation, centre grid and zodiac ring. Eleven planetary glyphs and thirty-three satellites encode the exact 32-byte identity through eleven distinct separated groups from exactly 256 legal anchors. Planetary glyphs are deterministic SVG outlines traced from their Unicode font contours. One hundred and twenty-eight indexed parity stars are scattered through an interior blue-noise field and contain RS(168,40) parity. Only twelve fixed calibration stars sit around the circumference.</metadata>
  <defs><clipPath id="inner-clip-v9"><circle cx="${centre}" cy="${centre}" r="${v9InnerClipRadius}"/></clipPath></defs>
  <rect id="background" x="0" y="0" width="${canvas}" height="${canvas}" fill="${background}"/>
  <g id="foreground-layer-0" data-recognition-role="literal-solar-constellation" data-orientation="upright" opacity="0.6" clip-path="url(#inner-clip-v9)">
    ${nestedSvg(constellationBody, constellation.viewBox, layer0X, layer0Y, layer0Size, layer0Size, `data-sign="${value.solar}" data-recognition-role="solar-constellation" data-orientation="upright"`)}
  </g>
  <g clip-path="url(#inner-clip-v9)">${sunLayer(planetaryColour, request.sunGlyph, request.calibrationSunGlyph)}</g>
  <g id="literal-sign-grid" data-recognition-role="literal-six-sign-grid" data-orientation="upright" opacity="0.28" clip-path="url(#inner-clip-v9)">${innerSigns(value, signs, parityColour, background)}</g>
  <g id="parity-stars-v9" data-code="reed-solomon-168-40-parity-stars-128-v9" data-layout="interior-blue-noise" data-code-role="error-correction-only" data-code-source-bytes="${request.dataByteCount}" data-code-parity-bytes="${request.parityByteCount}" data-code-stars="${request.parityByteCount}" data-code-colour="parity-star-foreground" clip-path="url(#inner-clip-v9)">${parityLayer(request.parityBytes, parityColour)}</g>
  <g id="planetary-identity-v9" data-code-role="exact-32-byte-identity" data-code-planets="${request.planets.length}" data-code-satellites="${request.planets.length * 3}" data-code-anchors="256" data-code-colour="planetary-foreground" clip-path="url(#inner-clip-v9)">${planetLayer(request.planets, planetaryColour)}</g>
  <g id="literal-ring-system" data-recognition-role="literal-sign-redundancy">
    <circle id="ring-outer" cx="${centre}" cy="${centre}" r="${outerRingRadius}" fill="none" stroke="${parityColour}" stroke-width="${ringStroke}"/>
    <circle id="ring-inner" cx="${centre}" cy="${centre}" r="${innerRingRadius}" fill="none" stroke="${parityColour}" stroke-width="${ringStroke}"/>
    ${ringSigns(value, signs, parityColour)}
  </g>
  ${calibrationStarsLayer(parityColour)}
</svg>
`;
}
