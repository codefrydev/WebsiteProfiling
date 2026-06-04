/**
 * Suppress Three.js deprecation warning from 3d-force-graph (THREE.Clock → THREE.Timer).
 * Import this first in main.jsx so the patch is active before 3d-force-graph loads.
 */
const origWarn: typeof console.warn = console.warn.bind(console);

console.warn = (...args: unknown[]): void => {
  const combined = args.map((a) => (a != null ? String(a) : '')).join(' ');
  if (combined.includes('Clock') && combined.includes('deprecated') && combined.includes('THREE')) return;
  origWarn(...args);
};
