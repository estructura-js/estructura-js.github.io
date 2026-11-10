/* shared/docs.js — JS exclusivamente compartido para documentación (abstracto, reutilizable, extensible). */
(function (global) {
  'use strict';

  var Docs = global.Docs = global.Docs || {};

  function domAll(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /* Abstracto: toggle colapsable (preserva API: .collapsed-links, aria-controls, data-read-more/less, .collapsed/.entirely) */
  Docs.Toggle = {
    SELECTOR: '.collapsed-links',
    COLLAPSED_CLASS: 'collapsed',
    init: function (root) {
      domAll(this.SELECTOR, root).forEach(function (el) {
        if (el.__docsToggleBound) return;
        el.__docsToggleBound = true;
        el.addEventListener('click', function (ev) {
          ev.preventDefault();
          Docs.Toggle.toggle(el);
        });
      });
    },
    toggle: function (el) {
      var id = el.getAttribute('aria-controls');
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      var isCollapsed = target.classList.contains(this.COLLAPSED_CLASS);
      if (isCollapsed) {
        target.classList.remove(this.COLLAPSED_CLASS);
        el.setAttribute('aria-expanded', 'true');
        el.textContent = el.dataset.readLess || el.textContent;
      } else {
        target.classList.add(this.COLLAPSED_CLASS);
        el.setAttribute('aria-expanded', 'false');
        el.textContent = el.dataset.readMore || el.textContent;
      }
    }
  };

  /* Abstracto: copiar snippet (preserva API: pre > code + button.copy, texto Copiar/Copiado) */
  Docs.Copy = {
    SELECTOR: 'pre, .site-install',
    DURATION: 1600,
    init: function (root) {
      domAll(this.SELECTOR, root).forEach(function (pre) {
        if (pre.__docsCopyBound) return;
        pre.__docsCopyBound = true;
        pre.addEventListener('click', function (ev) {
          try {
            if (window.getSelection && String(window.getSelection())) return;
          } catch (e) {}
          ev.preventDefault();
          var code = pre.querySelector('code');
          var btn = pre.querySelector('button.copy');
          if (!code) return;
          var text = code.textContent;
          function done() {
            if (!btn) return;
            btn.textContent = 'Copiado';
            btn.classList.add('is-copied');
            if (btn.__docsCopyTimer) clearTimeout(btn.__docsCopyTimer);
            btn.__docsCopyTimer = setTimeout(function () {
              btn.textContent = 'Copiar';
              btn.classList.remove('is-copied');
            }, Docs.Copy.DURATION);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(done, done);
          } else {
            var ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            try { ta.select(); document.execCommand('copy'); } catch (e) {}
            document.body.removeChild(ta);
            done();
          }
        });
      });
    }
  };

  /* Abstracto: listas de alternativas (ul.separated con un botón .collapsed-links + <pre> por opción)
     convertidas en pestañas accesibles. Sin JS, la lista original sigue funcionando. */
  Docs.Tabs = {
    SELECTOR: 'ul.separated',
    init: function (root) {
      domAll(this.SELECTOR, root).forEach(function (ul) {
        var items = domAll(':scope > li', ul);
        if (items.length < 2) return;
        var options = [];
        var valid = items.every(function (li) {
          var btn = li.querySelector(':scope > .collapsed-links');
          var pre = li.querySelector(':scope > pre');
          if (!btn || !pre || !pre.id) return false;
          options.push({ btn: btn, pre: pre });
          return true;
        });
        if (!valid) return;
        Docs.Tabs.build(ul, options);
      });
    },
    label: function (btn) {
      return String(btn.getAttribute('data-read-more') || btn.textContent).replace(/^\s*[+—–-]\s*/, '');
    },
    build: function (ul, options) {
      var wrap = document.createElement('div');
      wrap.className = 'docs-tabs';
      var list = document.createElement('div');
      list.className = 'docs-tablist';
      list.setAttribute('role', 'tablist');
      var prev = ul.previousElementSibling;
      if (prev && /^(B|STRONG)$/.test(prev.tagName)) list.setAttribute('aria-label', prev.textContent.replace(/[:\s]+$/, ''));
      wrap.appendChild(list);
      var selected = 0;
      options.forEach(function (o, i) { if (o.btn.getAttribute('aria-expanded') === 'true') selected = i; });
      var tabs = options.map(function (o, i) {
        var tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'docs-tab';
        tab.id = o.pre.id + '-tab';
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-controls', o.pre.id + '-panel');
        tab.textContent = Docs.Tabs.label(o.btn);
        list.appendChild(tab);
        var panel = document.createElement('div');
        panel.className = 'docs-tabpanel';
        panel.id = o.pre.id + '-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', tab.id);
        o.pre.classList.remove('collapsed');
        panel.appendChild(o.pre);
        wrap.appendChild(panel);
        tab.addEventListener('click', function () { select(i, false); });
        return { tab: tab, panel: panel };
      });
      function select(index, focus) {
        tabs.forEach(function (t, i) {
          var on = i === index;
          t.tab.setAttribute('aria-selected', on ? 'true' : 'false');
          t.tab.tabIndex = on ? 0 : -1;
          t.panel.hidden = !on;
        });
        if (focus) tabs[index].tab.focus();
      }
      /* Teclado: flechas, Inicio y Fin recorren las pestañas (patrón ARIA de activación automática) */
      list.addEventListener('keydown', function (ev) {
        var current = tabs.map(function (t) { return t.tab; }).indexOf(document.activeElement);
        if (current === -1) return;
        var next = { ArrowRight: current + 1, ArrowLeft: current - 1, Home: 0, End: tabs.length - 1 }[ev.key];
        if (next === undefined) return;
        ev.preventDefault();
        select((next + tabs.length) % tabs.length, true);
      });
      select(selected, false);
      ul.parentNode.replaceChild(wrap, ul);
    }
  };

  /* Abstracto: estado de desplazamiento compartido — sombra de la barra superior, progreso de lectura,
     botón "volver arriba" y logo de la barra oculto mientras se ve la portada (un único listener, agrupado por frame) */
  Docs.Scroll = {
    init: function () {
      var bar = document.querySelector('header.site-bar');
      var doc = document.documentElement;
      var hero = document.querySelector('.site-hero');
      var progress = null, top = null;
      if (bar && !bar.querySelector('.docs-progress')) {
        progress = document.createElement('span');
        progress.className = 'docs-progress';
        progress.setAttribute('aria-hidden', 'true');
        bar.appendChild(progress);
      }
      if (!document.querySelector('.docs-top')) {
        top = document.createElement('a');
        top.className = 'docs-top';
        top.href = '#';
        top.setAttribute('data-e-routing-excluded', '');
        top.setAttribute('aria-label', 'Volver arriba');
        top.title = 'Volver arriba';
        top.addEventListener('click', function (ev) {
          ev.preventDefault();
          window.scrollTo({ top: 0, behavior: 'smooth' });
          var skip = document.querySelector('.site-brand');
          if (skip && skip.focus) skip.focus({ preventScroll: true });
        });
        document.body.appendChild(top);
      }
      var ticking = false;
      var update = function () {
        ticking = false;
        var y = window.pageYOffset || doc.scrollTop;
        var h = window.innerHeight || doc.clientHeight;
        var max = Math.max(1, doc.scrollHeight - h);
        if (bar) bar.classList.toggle('is-scrolled', y > 4);
        /* En la portada el logo grande ya identifica el sitio: el de la barra aparece al salir de ella */
        if (bar && hero) bar.classList.toggle('is-hero', hero.getBoundingClientRect().bottom > bar.offsetHeight);
        if (progress) progress.style.setProperty('--docs-progress', Math.min(1, Math.max(0, y / max)).toFixed(4));
        if (top) top.classList.toggle('is-visible', y > h * 1.2);
      };
      var onScroll = function () {
        if (ticking) return;
        ticking = true;
        (window.requestAnimationFrame || function (f) { window.setTimeout(f, 16); })(update);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      update();
    }
  };

  /* Abstracto: en las páginas de extensión, la barra superior marca "Extensiones" como sección actual */
  Docs.SiteCurrent = {
    init: function () {
      if (!document.querySelector('.docs-sidebar')) return;
      domAll('.site-links a[href$="#extensions"]').forEach(function (a) { a.setAttribute('aria-current', 'true'); });
    }
  };

  /* Abstracto: highlight diferido (una sola vez, extensible) */
  Docs.Highlight = {
    CSS: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/stackoverflow-dark.min.css',
    JS: 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js',
    loaded: false,
    init: function () {
      if (this.loaded) return;
      this.loaded = true;
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = this.CSS;
      document.body.appendChild(link);
      var script = document.createElement('script');
      script.src = this.JS;
      script.onload = function () {
        try { if (global.hljs) global.hljs.highlightAll(); } catch (e) {}
        /* Con el lenguaje ya detectado, se afinan las etiquetas de los bloques */
        Docs.CodeBars.label();
      };
      document.body.appendChild(script);
    }
  };

  /* Abstracto: barra superior de cada bloque de código (lenguaje + botón Copiar existente) */
  Docs.CodeBars = {
    NAMES: { javascript: 'JavaScript', js: 'JavaScript', xml: 'HTML', html: 'HTML', css: 'CSS', json: 'JSON', bash: 'Shell', shell: 'Shell', sql: 'SQL', typescript: 'TypeScript' },
    init: function (root) {
      domAll('pre', root).forEach(function (pre) {
        if (pre.__docsBar) return;
        var code = pre.querySelector('code');
        if (!code) return;
        pre.__docsBar = true;
        var bar = document.createElement('div');
        bar.className = 'code-bar';
        var lang = document.createElement('span');
        lang.className = 'code-lang';
        bar.appendChild(lang);
        var btn = pre.querySelector('button.copy');
        if (btn) bar.appendChild(btn);
        pre.insertBefore(bar, pre.firstChild);
      });
      this.label();
    },
    /* Lenguaje detectado por highlight.js (clase language-*) o, si aún no está, una estimación por el contenido */
    label: function () {
      var names = this.NAMES;
      domAll('pre .code-lang').forEach(function (lang) {
        var code = lang.parentNode.parentNode.querySelector('code');
        if (!code) return;
        var match = /\blanguage-([\w-]+)/.exec(code.className);
        var key = match ? match[1].toLowerCase() : '';
        /* La detección automática a veces elige variantes (php-template, arduino…): solo se muestran los lenguajes conocidos */
        if (!names[key]) key = /^\s*</.test(code.textContent) ? 'html' : 'javascript';
        lang.textContent = names[key];
      });
    }
  };

  /* Abstracto: ancla "#" junto a cada título con id (aparece al pasar el ratón o con el foco) */
  Docs.Anchors = {
    init: function () {
      domAll('main h2[id], main h3[id], main h4[id]').forEach(function (h) {
        if (h.querySelector('.docs-anchor')) return;
        var a = document.createElement('a');
        a.className = 'docs-anchor';
        a.href = '#' + h.id;
        /* Ancla interna: no debe ser interceptada por extensiones de enrutamiento */
        a.setAttribute('data-e-routing-excluded', '');
        a.setAttribute('aria-label', 'Enlace a esta sección');
        a.textContent = '#';
        h.appendChild(a);
      });
    }
  };

  /* Abstracto: enlaces "anterior / siguiente" al final, según el orden de la barra lateral */
  Docs.Pager = {
    init: function () {
      var main = document.querySelector('main');
      var links = domAll('.docs-sidebar a');
      if (!main || links.length < 2 || document.querySelector('.docs-pager')) return;
      var index = -1;
      links.forEach(function (a, i) { if (a.getAttribute('aria-current') === 'page') index = i; });
      if (index === -1) return;
      var nav = document.createElement('nav');
      nav.className = 'docs-pager';
      nav.setAttribute('aria-label', 'Otras extensiones');
      function item(link, label, cls) {
        var a = document.createElement('a');
        a.className = 'docs-pager-link ' + cls;
        a.href = link.getAttribute('href');
        a.setAttribute('data-e-routing-excluded', '');
        var small = document.createElement('span');
        small.className = 'docs-pager-label';
        small.textContent = label;
        var name = document.createElement('span');
        name.className = 'docs-pager-name';
        name.textContent = link.textContent;
        a.appendChild(small);
        a.appendChild(name);
        return a;
      }
      if (index > 0) nav.appendChild(item(links[index - 1], 'Anterior', 'docs-pager-prev'));
      if (index < links.length - 1) nav.appendChild(item(links[index + 1], 'Siguiente', 'docs-pager-next'));
      main.appendChild(nav);
    }
  };

  /* Abstracto: fija como absolutas las rutas relativas de la navegación del sitio, para que sigan
     funcionando si la página cambia su URL con la API History (p. ej., la demo de Routing) */
  Docs.Links = {
    init: function () {
      domAll('.site-bar a[href], .docs-sidebar a[href], .docs-pager a[href], .docs-footer a[href]').forEach(function (a) {
        if (a.getAttribute('href').charAt(0) !== '#') a.setAttribute('href', a.href);
      });
    }
  };

  /* Demo legacy preservada (compatibilidad): _e print */
  Docs.Demo = {
    init: function () {
      try {
        if (global._e) {
          global._e.subtype({ String: { Print: function (a) { return a === 'print'; } } });
          global._e.fn({ Print: { String: function (print, string) { console.info(string); } } });
          global._e('print', 'Estructura, JavaScript Framework.');
        }
      } catch (e) {}
    }
  };

  function slugify(text) {
    var s = String(text || '').toLowerCase();
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'seccion';
  }

  /* Abstracto: skip-link (a11y, sin tocar texto) */
  Docs.Skip = {
    init: function () {
      if (document.querySelector('.docs-skip')) return;
      var main = document.querySelector('main');
      if (!main) return;
      if (!main.id) main.id = 'contenido';
      var a = document.createElement('a');
      a.className = 'docs-skip';
      a.href = '#' + main.id;
      /* Ancla interna: no debe ser interceptada por extensiones de enrutamiento */
      a.setAttribute('data-e-routing-excluded', '');
      a.textContent = 'Saltar al contenido';
      document.body.insertBefore(a, document.body.firstChild);
    }
  };

  /* Abstracto: TOC jerárquico generado desde h2/h3/h4 (no añade/quita texto doc) */
  Docs.TOC = {
    SELECTOR: 'main.docs-main, main',
    LEVELS: { H2: 2, H3: 3, H4: 4 },
    init: function () {
      var main = document.querySelector(this.SELECTOR);
      if (!main || document.querySelector('.docs-toc')) return;

      var used = {};
      var items = [];
      Array.prototype.forEach.call(main.querySelectorAll('h2[id], h3, h4'), function (h) {
        var level = Docs.TOC.LEVELS[h.tagName];
        if (!level) return;
        var text = (h.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        if (!h.id) {
          var base = slugify(text), id = base, n = 2;
          while (document.getElementById(id) || used[id]) { id = base + '-' + (n++); }
          h.id = id;
        }
        used[h.id] = true;
        items.push({ id: h.id, text: text, level: level });
      });
      if (items.length < 2) return;

      var tree = { level: 1, children: [] };
      var stack = [tree];
      items.forEach(function (it) {
        while (stack.length > 1 && stack[stack.length - 1].level >= it.level) stack.pop();
        var node = { id: it.id, text: it.text, level: it.level, children: [] };
        stack[stack.length - 1].children.push(node);
        stack.push(node);
      });

      var toc = document.createElement('details');
      toc.className = 'docs-toc';
      var summary = document.createElement('summary');
      summary.className = 'docs-toc-title';
      summary.textContent = 'En esta página';
      toc.appendChild(summary);
      toc.appendChild(this.render(tree.children));

      /* Desktop: sidebar abierto. Móvil/tablet: bloque colapsable */
      var mq = window.matchMedia ? window.matchMedia('(min-width: 1280px)') : null;
      var sync = function () { toc.open = mq ? mq.matches : true; };
      sync();
      if (mq) {
        if (mq.addEventListener) mq.addEventListener('change', sync);
        else if (mq.addListener) mq.addListener(sync);
      }
      /* Móvil/tablet: al elegir una sección, el índice se pliega sin animación antes del salto,
         para que el desplazamiento llegue al título correcto */
      toc.addEventListener('click', function (ev) {
        if (!mq || mq.matches) return;
        var node = ev.target;
        if (!node || !node.closest || !node.closest('a[href^="#"]')) return;
        toc.classList.add('is-instant');
        toc.open = false;
        window.setTimeout(function () { toc.classList.remove('is-instant'); }, 50);
      });

      var body = document.createElement('div');
      body.className = 'docs-body';
      main.parentNode.insertBefore(body, main);
      /* Tres columnas: navegación de extensiones (si existe), contenido e índice de la página */
      var sidebar = document.querySelector('.docs-sidebar');
      if (sidebar) { body.appendChild(sidebar); body.className += ' has-sidebar'; }
      body.appendChild(main);
      body.appendChild(toc);
    },
    render: function (nodes) {
      var ol = document.createElement('ol');
      nodes.forEach(function (node) {
        var li = document.createElement('li');
        li.setAttribute('data-level', node.level);
        var a = document.createElement('a');
        a.href = '#' + node.id;
        /* Ancla interna: no debe ser interceptada por extensiones de enrutamiento */
        a.setAttribute('data-e-routing-excluded', '');
        a.textContent = node.text;
        li.appendChild(a);
        if (node.children.length) li.appendChild(Docs.TOC.render(node.children));
        ol.appendChild(li);
      });
      return ol;
    }
  };

  /* Abstracto: scrollspy único para nav existente + TOC (solo aria-current, sin cambiar texto) */
  Docs.Nav = {
    init: function () {
      var links = document.querySelectorAll('nav a[href^="#"], .docs-toc a[href^="#"]');
      if (!links.length) return;
      this.links = Array.prototype.slice.call(links);
      var seen = {};
      var ids = [];
      this.links.forEach(function (a) {
        var id = a.getAttribute('href').slice(1);
        if (!id || seen[id] || !document.getElementById(id)) return;
        seen[id] = true;
        ids.push(id);
      });
      if (!ids.length) return;
      /* Orden documental: permite elegir "el último encabezado que pasó la línea" */
      ids.sort(function (a, b) {
        var ea = document.getElementById(a), eb = document.getElementById(b);
        return (ea.compareDocumentPosition(eb) & 4) ? -1 : 1;
      });
      this.ids = ids;
      this.bind();
      this.update();
    },
    setCurrent: function (id) {
      if (!id) return;
      this.current = id;
      this.links.forEach(function (a) {
        if (a.getAttribute('href').slice(1) === id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    },
    update: function () {
      var ids = this.ids;
      if (!ids || !ids.length) return;
      var line = (window.innerHeight || document.documentElement.clientHeight) * 0.25;
      var current = ids[0];
      for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= line) current = ids[i];
        else break;
      }
      /* Al final del documento, el último ancla siempre queda activa */
      var doc = document.documentElement;
      if ((window.innerHeight + (window.pageYOffset || doc.scrollTop)) >= (doc.scrollHeight - 2)) {
        current = ids[ids.length - 1];
      }
      if (current !== this.current) this.setCurrent(current);
    },
    bind: function () {
      var self = this;
      var ticking = false;
      var settleTimer = null;
      var onScroll = function () {
        /* Tras un clic, el ancla queda activa; el primer scroll real retoma el spy */
        if (self.locked === 'settled') self.locked = false;
        if (self.locked) {
          if (settleTimer) window.clearTimeout(settleTimer);
          settleTimer = window.setTimeout(function () {
            if (self.locked) self.locked = 'settled';
          }, 160);
          return;
        }
        if (ticking) return;
        ticking = true;
        var run = function () { ticking = false; self.update(); };
        if (window.requestAnimationFrame) window.requestAnimationFrame(run);
        else window.setTimeout(run, 66);
      };
      var unlock = function () {
        if (!self.locked) return;
        self.locked = false;
        if (settleTimer) window.clearTimeout(settleTimer);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      window.addEventListener('wheel', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      window.addEventListener('keydown', unlock);
      /* Clic en un ancla: estado inmediato y persistente hasta el siguiente scroll */
      document.addEventListener('click', function (ev) {
        var node = ev.target;
        while (node && node.nodeType === 1 && node.tagName !== 'A') node = node.parentNode;
        if (!node || node.tagName !== 'A') return;
        var href = node.getAttribute('href') || '';
        if (href.charAt(0) !== '#' || href.length < 2) return;
        var id = href.slice(1);
        if (!self.ids || self.ids.indexOf(id) === -1) return;
        self.locked = true;
        self.setCurrent(id);
      });
    }
  };

  /* Abstracto: en la barra de navegación desplazable (móvil), muestra la página actual */
  Docs.NavCurrent = {
    init: function () {
      var current = document.querySelector('.docs-nav a[aria-current="page"]');
      if (!current) return;
      var list = current.closest ? current.closest('ul') : null;
      if (!list || list.scrollWidth <= list.clientWidth) return;
      var cr = current.getBoundingClientRect(), lr = list.getBoundingClientRect();
      list.scrollLeft += (cr.left + cr.width / 2) - (lr.left + list.clientLeft + list.clientWidth / 2);
    }
  };

  Docs.init = function (root) {
    Docs.Demo.init();
    Docs.Highlight.init();
    Docs.Tabs.init(root);
    Docs.Toggle.init(root);
    Docs.Copy.init(root);
    Docs.CodeBars.init(root);
    Docs.Skip.init();
    Docs.TOC.init();
    Docs.Anchors.init();
    Docs.Pager.init();
    Docs.Links.init();
    Docs.SiteCurrent.init();
    Docs.Nav.init();
    Docs.NavCurrent.init();
    Docs.Scroll.init();
  };

  function ready(fn) {
    try {
      if (global._events) { global._events(document).ready(fn); return; }
    } catch (e) {}
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () { Docs.init(document); });
})(typeof window !== 'undefined' ? window : this);
