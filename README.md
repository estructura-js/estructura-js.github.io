# Estructura: sitio y CDN

Repositorio del sitio [estructura.okzgn.com](https://estructura.okzgn.com/): documentación, ejemplos y distribución por CDN de **Estructura** y de sus extensiones.

Estructura es un framework de JavaScript ligero y sin dependencias que asigna funciones a tipos de datos (nativos, personalizados o extendidos) y las resuelve por despacho múltiple según los tipos de uno o varios argumentos. La documentación canónica del núcleo y el paquete npm están en [github.com/okzgn/estructura](https://github.com/okzgn/estructura) y [npmjs.com/estructura-js](https://npmjs.com/estructura-js).

## Estructura del repositorio

| Ruta | Contenido |
|---|---|
| `index.html` | Portada del sitio |
| `estructura.umd.js` | Núcleo (UMD, ES3+) servido por el CDN |
| `extensions/<nombre>/` | Cada extensión: `estructura.<nombre>.js` y su documentación `index.html` |
| `examples/` | Implementaciones de ejemplo; `examples/shared/` contiene el código común |
| `shared/` | Estilos y scripts de las páginas de documentación |
| `wrangler.jsonc`, `.assetsignore` | Despliegue en Cloudflare Workers (assets estáticos) |

## Extensiones y orden de carga

Primero se carga el núcleo (`estructura.umd.js`, que expone `_e`) y después las extensiones. Cada una usa su propia instancia aislada (`_e.instance(...)`) a partir de la variable global `_e`, así que el núcleo debe cargarse como script UMD: si se importa como módulo ES (`https://unpkg.com/estructura-js/dist/estructura.esm.mjs`), no crea ese global y las extensiones no funcionan, salvo que se asigne antes de cargarlas (`window._e = _e`).

| Extensión | Global | Requiere |
|---|---|---|
| HTTP | `_http` | — |
| DOM | `_dom` | — |
| Events | `_events` | — |
| Reactive | `_reactive` | — |
| Routing | `_routing` | — |
| SQLite Frontend | `_sqlite_frontend` | Autoalojado (ver nota) |
| Components | `_components` | `_http` |
| Handlers | `_handlers` | `_events` |

```html
<script src="https://estructura.okzgn.com/estructura.umd.js"></script>
<script src="https://estructura.okzgn.com/extensions/events/estructura.events.js"></script>
<script src="https://estructura.okzgn.com/extensions/handlers/estructura.handlers.js"></script>
```

**Nota sobre SQLite Frontend:** su Web Worker se crea con una ruta relativa a la página (`./estructura.sqlite.frontend.wasm.worker.js`) y los Workers no pueden cargarse desde otro origen. Por eso no basta con el CDN: copie `estructura.sqlite.frontend.js`, `estructura.sqlite.frontend.wasm.worker.js` y `_dependencies/_sqlite/` en el mismo directorio que la página que lo usa.

## Rendimiento

Cada llamada al despachador cuesta del orden de microsegundos. El costo crece con:

- el número de argumentos de `_e(...)`;
- la cantidad de tipos detectados por argumento (tipo base + subtipos + alias);
- las funciones de subtipo (`_e.subtype({ String: { Email: function (input) { ... } } })`), que se ejecutan en **cada** llamada con un argumento de su tipo padre.

Recomendaciones:

- Reutilice el resultado de `_e(valor)` si va a llamar a varios de sus métodos.
- Mantenga ligeras las funciones de subtipo; los alias en cadena de texto (`Array: 'Collection'`) no ejecutan código.
- Evite cadenas de subtipos innecesariamente profundas.

## Seguridad

- **DOM y Reactive** incluyen un sanitizador reemplazable (`_dom.sanitize` y `_reactive.sanitize`; en Reactive también la opción `sanitizer` por instancia). Por defecto neutraliza esquemas peligrosos (`javascript:`, `vbscript:`, `data:` no multimedia) en atributos y propiedades de URL, y en Reactive bloquea la interpolación en atributos `on*`. No modifica texto, `value`/`checked` ni los destinos HTML (`innerHTML`, `outerHTML`, `srcdoc`): para estos últimos, conecte una librería como DOMPurify reemplazando la función `sanitize`. Detalles en `extensions/dom/` y `extensions/reactive/`.
- **Components** descarga y ejecuta CSS, HTML y JS. Si el DOM puede contener HTML de usuarios, los atributos `data-e-components-origin` permitirían cargar código de terceros: configure la lista blanca `allowedOrigins` en producción. Detalles en `extensions/components/`.

## Despliegue

El sitio se publica como assets estáticos en Cloudflare Workers:

```bash
npx wrangler deploy
```

Para servirlo en local:

```bash
npx wrangler dev
```

`.assetsignore` excluye del despliegue los archivos que no deben publicarse (git, configuración y este README).

## Licencias

- **Núcleo** (`estructura.umd.js`): MIT. Ver [`LICENSE`](LICENSE).
- **Extensiones** (`extensions/`): GNU AGPL v3.0. Ver [`extensions/LICENSE`](extensions/LICENSE). Hay licencias comerciales disponibles en [okzgn.com/#contact](https://okzgn.com/#contact) o [okzgn.github.io/#contact](https://okzgn.github.io/#contact).

© OKZGN
