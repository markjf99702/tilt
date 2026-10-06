// Every table, by id. Each one is a folder under js/tables/ whose index.js says what it brings.
// Its files also go in sw.js's SHELL, so it plays offline (test/e2e.mjs checks).
import classic from './tables/classic/index.js';

export const TABLES = { classic };
