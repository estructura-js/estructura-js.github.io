/*
    Estructura Documentation Website
    main.js: this file is not the framework.
*/

_e.subtype({
    String: {
        Print: function(a){
            return a === 'print';
        }
    }
});

_e.fn({
    Print: {
        String: function(print, string){
            console.info(string);
        }
    }
})

_e('print', 'Estructura, JavaScript Framework.');

_events(document).ready(function () {
  console.log('Loading highlight.js.');

  var link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/stackoverflow-dark.min.css';
  document.body.appendChild(link);

  var script = document.createElement('script');
  var script_loader = function () { hljs.highlightAll(); };
  script.src = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js';
  script.onload = function () {
    console.log('Executing', script_loader);
    script_loader();
  };
  document.body.appendChild(script);

  var collapsed_links = _dom('>.collapsed-links');
  collapsed_links.each(function (element) {
    _events(element).on('click', function (event) {
      event.preventDefault();
      var

        target = _dom('>#' + element.getAttribute('aria-controls')),
        _element = _dom(element),
        _target_class = /[\b\s]*collapsed[\b\s]*/g,
        _class = target.get('className')[0] || '',
        _original_class = _class.replace(_target_class, '');

      if (_target_class.test(_class)) {
        target.set('className', _original_class);
        _element.set('ariaExpanded', 'true');
        _element.set('textContent', element.dataset.readLess);
        return;
      }

      target.set('className', _original_class + ' collapsed');
      _element.set('ariaExpanded', 'false');
      _element.set('textContent', element.dataset.readMore);
    });
  });

  var pre_codes = _dom('>pre');
  pre_codes.each(function (element) {
    _events(element).on('click', function (event) {
      event.preventDefault();

      var code = element.querySelector('code');
      var btn = element.querySelector('button.copy');

      if (code && navigator.clipboard && navigator.clipboard.writeText) {
        console.log('Copy:', code.textContent);
        navigator.clipboard.writeText(code.textContent);

        if (btn) {
          btn.textContent = 'Copiado';
          setTimeout(function () {
            btn.textContent = 'Copiar';
          }, 567);
        }
      }
    });
  });
});
