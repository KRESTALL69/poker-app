// no-op stub for the "server-only" package under Vitest.
//
// "server-only" protects against accidental client-bundle inclusion via a
// Next.js-specific build-time loader (webpack/SWC) that special-cases this
// package for the server compilation target. Vitest runs tests through Vite's
// own SSR pipeline (vite-node), which has no such special-casing — outside of
// Next.js's own bundler, importing "server-only" always throws unconditionally,
// even in legitimate server-side test runs. This stub is aliased in place of
// the real package for tests only (see vitest.config.ts) so repository code
// guarded by `import "server-only"` can still be exercised by Feature tests.
export {};
