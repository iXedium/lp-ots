/**
 * Compile-time dev flag.
 * Vite replaces import.meta.env.DEV with `true`/`false` at build time,
 * so all `if (IS_DEV) { … }` blocks are tree-shaken out of production builds.
 */
export const IS_DEV = import.meta.env.DEV
