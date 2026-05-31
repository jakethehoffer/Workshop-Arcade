// Canonical public URL settings for generated Workshop Arcade surfaces.
//
// Defaults target the current GitHub Pages deployment. Set
// WORKSHOP_ARCADE_SITE_ORIGIN=https://example.com and
// WORKSHOP_ARCADE_SITE_BASE_PATH=/ to regenerate root-domain metadata without
// hand-editing catalog or game pages.

const DEFAULT_SITE_ORIGIN = 'https://jakethehoffer.github.io';
const DEFAULT_SITE_BASE_PATH = '/Workshop-Arcade/';

function normalizeOrigin(value) {
  const raw = String(value || DEFAULT_SITE_ORIGIN).trim().replace(/\/+$/, '');
  const url = new URL(raw);
  return url.origin;
}

function normalizeBasePath(value) {
  const raw = String(value ?? DEFAULT_SITE_BASE_PATH).trim();
  if (!raw || raw === '/') return '/';
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`;
}

export const SITE_ORIGIN = normalizeOrigin(
  process.env.WORKSHOP_ARCADE_SITE_ORIGIN ||
  process.env.WORKSHOP_ARCADE_CANONICAL_ORIGIN ||
  DEFAULT_SITE_ORIGIN
);

export const SITE_BASE_PATH = normalizeBasePath(
  process.env.WORKSHOP_ARCADE_SITE_BASE_PATH ||
  process.env.WORKSHOP_ARCADE_BASE_PATH ||
  DEFAULT_SITE_BASE_PATH
);

export const SITE_URL = new URL(SITE_BASE_PATH, `${SITE_ORIGIN}/`).href;

export function siteUrl(path = '') {
  const raw = String(path || '');
  if (!raw) return SITE_URL;
  if (/^[a-z][a-z\d+.-]*:/i.test(raw)) return raw;
  if (raw.startsWith('?') || raw.startsWith('#')) return `${SITE_URL}${raw}`;
  return new URL(raw.replace(/^\/+/, ''), SITE_URL).href;
}
