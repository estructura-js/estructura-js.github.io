/* The library creates its Worker relative to the page, so the Spanish page needs this file next to it.
   It loads the real Worker, whose own imports resolve against its location. */
import '../../../extensions/sqlite.frontend/estructura.sqlite.frontend.wasm.worker.js';
