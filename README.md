# Estructura: site and CDN

**English** · [Español](README.es.md)

Repository of the [estructura.okzgn.com](https://estructura.okzgn.com/) site: documentation, examples, and CDN distribution of **Estructura** and its extensions.

Estructura is a lightweight, dependency-free JavaScript framework that assigns functions to data types (native, custom, or extended) and resolves them through multiple dispatch based on the types of one or more arguments. The canonical documentation of the core and the npm package are at [github.com/okzgn/estructura](https://github.com/okzgn/estructura) and [npmjs.com/estructura-js](https://npmjs.com/estructura-js).

## Repository structure

| Path | Contents |
|---|---|
| `index.html` | Site home page (in English) |
| `es/` | Spanish version of the site, with the same folder structure; it shares the root's styles, scripts, and extensions |
| `estructura.umd.js` | Core (UMD, ES3+) served by the CDN |
| `extensions/<name>/` | Each extension: `estructura.<name>.js` and its `index.html` documentation |
| `examples/` | Example implementations; `examples/shared/` contains the common code |
| `shared/` | Styles and scripts of the documentation pages |
| `tools/i18n/` | Glossary, style guide, review log, and verification scripts for the translation (not published) |
| `wrangler.jsonc`, `.assetsignore` | Deployment to Cloudflare Workers (static assets) |

## Extensions and load order

The core (`estructura.umd.js`, which exposes `_e`) is loaded first, and then the extensions. Each one uses its own isolated instance (`_e.instance(...)`) created from the global variable `_e`, so the core must be loaded as a UMD script: if it is imported as an ES module (`https://unpkg.com/estructura-js/dist/estructura.esm.mjs`), it does not create that global and the extensions do not work, unless it is assigned before loading them (`window._e = _e`).

| Extension | Global | Requires |
|---|---|---|
| HTTP | `_http` | — |
| DOM | `_dom` | — |
| Events | `_events` | — |
| Reactive | `_reactive` | — |
| Routing | `_routing` | — |
| SQLite Frontend | `_sqlite_frontend` | Self-hosted (see note) |
| Components | `_components` | `_http` |
| Handlers | `_handlers` | `_events` |

```html
<script src="https://estructura.okzgn.com/estructura.umd.js"></script>
<script src="https://estructura.okzgn.com/extensions/events/estructura.events.js"></script>
<script src="https://estructura.okzgn.com/extensions/handlers/estructura.handlers.js"></script>
```

**Note on SQLite Frontend:** its Web Worker is created with a path relative to the page (`./estructura.sqlite.frontend.wasm.worker.js`), and Workers cannot be loaded from another origin. That is why the CDN is not enough: copy `estructura.sqlite.frontend.js`, `estructura.sqlite.frontend.wasm.worker.js`, and `_dependencies/_sqlite/` into the same directory as the page that uses it.

## Performance

Each call to the dispatcher costs on the order of microseconds. The cost grows with:

- the number of arguments of `_e(...)`;
- the number of types detected per argument (base type + subtypes + aliases);
- subtype functions (`_e.subtype({ String: { Email: function (input) { ... } } })`), which run on **every** call with an argument of their parent type.

Recommendations:

- Reuse the result of `_e(value)` if you are going to call several of its methods.
- Keep subtype functions lightweight; string aliases (`Array: 'Collection'`) do not run any code.
- Avoid unnecessarily deep subtype chains.

## Security

- **DOM and Reactive** include a replaceable sanitizer (`_dom.sanitize` and `_reactive.sanitize`; in Reactive, also the per-instance `sanitizer` option). By default, it neutralizes dangerous schemes (`javascript:`, `vbscript:`, non-media `data:`) in URL attributes and properties, and in Reactive it blocks interpolation in `on*` attributes. It does not modify text, `value`/`checked`, or HTML sinks (`innerHTML`, `outerHTML`, `srcdoc`): for the latter, plug in a library such as DOMPurify by replacing the `sanitize` function. Details in `extensions/dom/` and `extensions/reactive/`.
- **Components** downloads and runs CSS, HTML, and JS. If the DOM can contain user HTML, the `data-e-components-origin` attributes would allow loading third-party code: configure the `allowedOrigins` allowlist in production. Details in `extensions/components/`.

## Deployment

The site is published as static assets on Cloudflare Workers:

```bash
npx wrangler deploy
```

To serve it locally:

```bash
npx wrangler dev
```

`.assetsignore` excludes from deployment the files that must not be published (git, configuration, the READMEs, and `tools/`).

## Licenses

- **Core** (`estructura.umd.js`): MIT. See [`LICENSE`](LICENSE).
- **Extensions** (`extensions/`): GNU AGPL v3.0. See [`extensions/LICENSE`](extensions/LICENSE). Commercial licenses are available at [okzgn.com/#contact](https://okzgn.com/#contact) or [okzgn.github.io/#contact](https://okzgn.github.io/#contact).

© OKZGN
