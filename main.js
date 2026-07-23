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

document.addEventListener('DOMContentLoaded', function(){
    console.log('Loading highlight.js.');

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/styles/stackoverflow-dark.min.css';
    document.body.appendChild(link);

    var script = document.createElement('script');
    var script_loader = function(){ hljs.highlightAll(); };
    script.src = 'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11.11.1/build/highlight.min.js';
    script.onload = function(){
        console.log('Executing', script_loader);
        script_loader();
    };
    document.body.appendChild(script);
});
