// Configurable target OE% used as a visual default (chart reference lines,
// new-threshold form defaults). Mirrors the server's own
// DEFAULT_EFFICIENCY_THRESHOLD (server/src/config/constants.js, itself
// overridable via the DEFAULT_EFFICIENCY_THRESHOLD env var) — but this is a
// separate constant, not fetched at runtime, since it's only ever used here as
// a display default. Actual pass/fail status always comes from the server's
// response, never computed client-side against this value.
export const DEFAULT_EFFICIENCY_THRESHOLD = 85;

// Fixed OE% color bands used across employee-facing widgets (efficiency rings,
// dashboard cards, status badges, trend charts). Deliberately independent of
// DEFAULT_EFFICIENCY_THRESHOLD above — this is a general "how are we doing"
// visual scale that doesn't track the admin-configurable per-process
// threshold, even though both currently happen to be 85.
export const WARNING_THRESHOLD = 85; // at/below this (and above CRITICAL_THRESHOLD), shown as yellow
export const CRITICAL_THRESHOLD = 75; // at/below this, shown as red
