/**
 * themes.js — theme dictionary, metadata, and runtime activation.
 */

export const THEMES = [
  {
    id: 'system',
    name: 'Auto (System)',
    description: 'Follow system appearance',
    mode: 'auto',
    icon: '⚙️',
  },
  {
    id: 'dark',
    name: 'Point-CAD Dark',
    description: 'Technical CAD dark theme with cyan & amber',
    mode: 'dark',
    icon: '🌙',
    palette: {
      base: 0x9fc3e6,
      baseLetter: 0xf6f8fb,
      dim: 0x3c4a5c,
      dimLetter: 0x7a8794,
      selected: 0x2ec4b6,
      selectedLetter: 0xffffff,
      legal: 0xffd166,
      legalLetter: 0xfff3c4,
      cursor: 0x8ecae6,
      cursorLetter: 0xffffff,
      hint: 0xff9f1c,
      hintLetter: 0xffffff,
    },
  },
  {
    id: 'light',
    name: 'Point-CAD Light',
    description: 'Clean CAD blueprint light theme',
    mode: 'light',
    icon: '☀️',
    palette: {
      base: 0x2563eb,
      baseLetter: 0x0f172a,
      dim: 0x94a3b8,
      dimLetter: 0x64748b,
      selected: 0x0d9488,
      selectedLetter: 0xffffff,
      legal: 0xd97706,
      legalLetter: 0x451a03,
      cursor: 0x0284c7,
      cursorLetter: 0xffffff,
      hint: 0xe11d48,
      hintLetter: 0xffffff,
    },
  },
  {
    id: 'midnight',
    name: 'Troggle Midnight',
    description: 'Deep navy with neon teal and gold',
    mode: 'dark',
    icon: '🌌',
    palette: {
      base: 0x4a7c9d,
      baseLetter: 0xeef2f6,
      dim: 0x203042,
      dimLetter: 0x5a6d82,
      selected: 0x2ec4b6,
      selectedLetter: 0xffffff,
      legal: 0xffd166,
      legalLetter: 0x241f1b,
      cursor: 0x56cfe1,
      cursorLetter: 0xffffff,
      hint: 0xff9f1c,
      hintLetter: 0xffffff,
    },
  },
  {
    id: 'synthwave',
    name: 'Synthwave 80s',
    description: 'Retro purple, hot pink, and radiant cyan',
    mode: 'dark',
    icon: '🌆',
    palette: {
      base: 0xb5179e,
      baseLetter: 0xfde2e4,
      dim: 0x480ca8,
      dimLetter: 0x7209b7,
      selected: 0xf72585,
      selectedLetter: 0xffffff,
      legal: 0x4cc9f0,
      legalLetter: 0x03045e,
      cursor: 0x7209b7,
      cursorLetter: 0xffffff,
      hint: 0xffb703,
      hintLetter: 0x023047,
    },
  },
  {
    id: 'forest',
    name: 'Nordic Forest',
    description: 'Earthy moss greens, amber, and warm birch',
    mode: 'dark',
    icon: '🌲',
    palette: {
      base: 0x52796f,
      baseLetter: 0xe9f5ed,
      dim: 0x2f3e3a,
      dimLetter: 0x6b877f,
      selected: 0x74c69d,
      selectedLetter: 0x081c15,
      legal: 0xd4a373,
      legalLetter: 0x2b1c11,
      cursor: 0x95d5b2,
      cursorLetter: 0x1b4332,
      hint: 0xe76f51,
      hintLetter: 0xffffff,
    },
  },
];

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
let _colorProbe = null;
/**
  * Resolves any valid CSS color string into a 24-bit integer hex value.
  * Supports hex, rgb, hsl, oklch, and color-mix.
  */
export function parseCssColorToHex(cssValue, fallbackHex = 0xffffff) {
   if (!cssValue) return fallbackHex;
   const val = String(cssValue).trim();
   if (!val) return fallbackHex;
   if (val.startsWith('#') && (val.length === 7 || val.length === 4)) {
     const hexStr = val.length === 4 
       ? val[1] + val[1] + val[2] + val[2] + val[3] + val[3] 
       : val.slice(1);
     const num = parseInt(hexStr, 16);
     if (!Number.isNaN(num)) return num;
   }
   if (typeof document === 'undefined') return fallbackHex;
   try {
     if (!_colorProbe) {
       _colorProbe = document.createElement('div');
       _colorProbe.style.display = 'none';
       _colorProbe.style.position = 'absolute';
     }
     if (!_colorProbe.parentNode) {
       (document.body || document.documentElement).appendChild(_colorProbe);
     }
     _colorProbe.style.color = '';
     _colorProbe.style.color = val;
     const computed = getComputedStyle(_colorProbe).color;
     if (computed) {
       const m = computed.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
       if (m) {
         const r = Math.round(Number(m[1]));
         const g = Math.round(Number(m[2]));
         const b = Math.round(Number(m[3]));
         return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
       }
       const srgb = computed.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
       if (srgb) {
         const r = Math.round(Math.min(1, Math.max(0, Number(srgb[1]))) * 255);
         const g = Math.round(Math.min(1, Math.max(0, Number(srgb[2]))) * 255);
         const b = Math.round(Math.min(1, Math.max(0, Number(srgb[3]))) * 255);
         return (r << 16) | (g << 8) | b;
       }
     }
   } catch {
     /* fallback */
   }
   return fallbackHex;
}
/**
  * Retrieves the computed hex value of a CSS custom property from :root / documentElement.
  */
export function getComputed3DColor(varName, fallbackHex = 0xffffff) {
   if (typeof window === 'undefined' || typeof document === 'undefined') return fallbackHex;
   const style = getComputedStyle(document.documentElement);
   let raw = style.getPropertyValue(varName);
   if (!raw && varName.startsWith('--color-3d-')) {
     raw = style.getPropertyValue(varName.replace('--color-3d-', '--color-cube-'));
   } else if (!raw && varName.startsWith('--color-cube-')) {
     raw = style.getPropertyValue(varName.replace('--color-cube-', '--color-3d-'));
   }
   if (!raw) return fallbackHex;
   return parseCssColorToHex(raw, fallbackHex);
}
/**
  * Extracts the entire 3D cube palette directly from active CSS custom properties.
  */
export function readThemePaletteFromDOM(themeFallback = null) {
   if (typeof window === 'undefined' || typeof document === 'undefined') return null;
   const style = getComputedStyle(document.documentElement);
   const getProp = (cubeKey, d3Key) =>
     (style.getPropertyValue(cubeKey) || style.getPropertyValue(d3Key) || '').trim();
   const baseStr = getProp('--color-cube-base', '--color-3d-base');
   if (!baseStr) return null;
   const fallback = themeFallback?.palette || {};
   return {
     base: parseCssColorToHex(baseStr, fallback.base ?? 0x9fc3e6),
     baseLetter: parseCssColorToHex(getProp('--color-cube-base-letter', '--color-3d-base-letter'), fallback.baseLetter ?? 0xf6f8fb),
     dim: parseCssColorToHex(getProp('--color-cube-dim', '--color-3d-dim'), fallback.dim ?? 0x3c4a5c),
     dimLetter: parseCssColorToHex(getProp('--color-cube-dim-letter', '--color-3d-dim-letter'), fallback.dimLetter ?? 0x7a8794),
     selected: parseCssColorToHex(getProp('--color-cube-selected', '--color-3d-selected'), fallback.selected ?? 0x2ec4b6),
     selectedLetter: parseCssColorToHex(getProp('--color-cube-selected-letter', '--color-3d-selected-letter'), fallback.selectedLetter ?? 0xffffff),
     legal: parseCssColorToHex(getProp('--color-cube-legal', '--color-3d-legal'), fallback.legal ?? 0xffd166),
     legalLetter: parseCssColorToHex(getProp('--color-cube-legal-letter', '--color-3d-legal-letter'), fallback.legalLetter ?? 0xfff3c4),
     cursor: parseCssColorToHex(getProp('--color-cube-cursor', '--color-3d-cursor'), fallback.cursor ?? 0x8ecae6),
     cursorLetter: parseCssColorToHex(getProp('--color-cube-cursor-letter', '--color-3d-cursor-letter'), fallback.cursorLetter ?? 0xffffff),
     hint: parseCssColorToHex(getProp('--color-cube-hint', '--color-3d-hint'), fallback.hint ?? 0xff9f1c),
     hintLetter: parseCssColorToHex(getProp('--color-cube-hint-letter', '--color-3d-hint-letter'), fallback.hintLetter ?? 0xffffff),
     halo: parseCssColorToHex(getProp('--color-cube-halo', '--color-3d-halo'), fallback.halo ?? 0x171a21),
   };
}


export function isThemeLight(themeId) {
  if (themeId === 'light') return true;
  if (!themeId || themeId === 'system' || themeId === 'auto') {
    return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-color-scheme: light)').matches);
  }
  const theme = getTheme(themeId);
  return theme?.mode === 'light';
}

export function applyTheme(themeId) {
  if (typeof document === 'undefined') {
    return { themeId, isLight: isThemeLight(themeId) };
  }
  const root = document.documentElement;
  if (!themeId || themeId === 'system' || themeId === 'auto') {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = themeId;
  }
  const isLight = isThemeLight(themeId);
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = isLight ? '#f8fafc' : '#0b1016';
  }
  return { themeId, isLight };
}

export default THEMES;