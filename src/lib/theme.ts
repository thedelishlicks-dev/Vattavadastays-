export type ThemeName = 'forest' | 'ocean' | 'spice' | 'mist' | 'bloom';

export interface FontOption {
  name: string;
  family: string;
  url: string;
}

export const FONTS: Record<string, FontOption> = {
  Fraunces: {
    name: 'Fraunces',
    family: '"Fraunces", serif',
    url: 'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap',
  },
  'Playfair Display': {
    name: 'Playfair Display',
    family: '"Playfair Display", serif',
    url: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&display=swap',
  },
  Cormorant: {
    name: 'Cormorant',
    family: '"Cormorant", serif',
    url: 'https://fonts.googleapis.com/css2?family=Cormorant:wght@600;700&display=swap',
  },
  'DM Serif Display': {
    name: 'DM Serif Display',
    family: '"DM Serif Display", serif',
    url: 'https://fonts.googleapis.com/css2?family=DM+Serif+Display&display=swap',
  },
  Spectral: {
    name: 'Spectral',
    family: '"Spectral", serif',
    url: 'https://fonts.googleapis.com/css2?family=Spectral:wght@600;700&display=swap',
  },
};

export interface ThemeColors {
  name: string;
  primary: string;
  primaryLight: string;
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  forest: {
    name: 'Forest',
    primary: 'oklch(0.45 0.13 148)', // #166534
    primaryLight: 'oklch(0.94 0.05 145)', // #dcfce7
  },
  ocean: {
    name: 'Ocean',
    primary: 'oklch(0.42 0.17 253)', // #1e40af
    primaryLight: 'oklch(0.91 0.04 239)', // #dbeafe
  },
  spice: {
    name: 'Spice',
    primary: 'oklch(0.44 0.18 42)', // #9a3412
    primaryLight: 'oklch(0.93 0.04 45)', // #ffedd5
  },
  mist: {
    name: 'Mist',
    primary: 'oklch(0.39 0.05 254)', // #334155
    primaryLight: 'oklch(0.96 0.01 254)', // #f1f5f9
  },
  bloom: {
    name: 'Bloom',
    primary: 'oklch(0.38 0.18 15)', // #9f1239
    primaryLight: 'oklch(0.92 0.04 15)', // #ffe4e6
  },
};

export function parseTheme(property: any): ThemeName {
  if (!property) return 'forest';

  // 1. Try dedicated column first
  if (property.theme && THEMES[property.theme as ThemeName]) {
    return property.theme as ThemeName;
  }

  // 2. Fallback to sentinel for backward compatibility
  const shared_amenities = property.shared_amenities as string[] | null;
  if (!shared_amenities) return 'forest';

  const entry = shared_amenities.find((a) => a.startsWith("__theme:"));
  const theme = entry ? (entry.slice("__theme:".length) as ThemeName) : 'forest';
  return THEMES[theme] ? theme : 'forest';
}

export function parseFont(property: any): string {
  if (!property?.heading_font) return 'Fraunces';
  return FONTS[property.heading_font] ? property.heading_font : 'Fraunces';
}

export function encodeTheme(theme: ThemeName, existing: string[]): string[] {
  const filtered = (existing ?? []).filter((a) => !a.startsWith("__theme:"));
  return [...filtered, `__theme:${theme}`];
}

export function applyTheme(themeName: ThemeName) {
  const theme = THEMES[themeName] || THEMES.forest;
  const root = document.documentElement;

  // Update the CSS variables that Tailwind uses
  root.style.setProperty('--primary', theme.primary);
  root.style.setProperty('--primary-light', theme.primaryLight);
  root.style.setProperty('--ring', theme.primary);
  root.style.setProperty('--accent', theme.primaryLight);

  // Persist to localStorage for FOUC prevention on next load
  localStorage.setItem('vattavadastays-theme', themeName);
}

export function applyFont(fontName: string) {
  const font = FONTS[fontName] || FONTS.Fraunces;
  const root = document.documentElement;

  // Update the font-display variable
  root.style.setProperty('--font-display', font.family);

  // Dynamically load the Google Font
  let link = document.getElementById('dynamic-heading-font') as HTMLLinkElement;
  if (!link) {
    link = document.createElement('link');
    link.id = 'dynamic-heading-font';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }

  if (link.href !== font.url) {
    link.href = font.url;
  }

  localStorage.setItem('vattavadastays-font', fontName);
}
