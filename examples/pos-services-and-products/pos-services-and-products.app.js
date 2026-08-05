(function () {
  'use strict';

  var appHandlers = {
    selectSection: function (event) {
      var
        selected = this.liveElement.getAttribute('data-pvsp-section'),
        links = document.querySelectorAll('[data-pvsp-section-link]'),
        views = document.querySelectorAll('[data-pvsp-view]'),
        title = document.getElementById('app-content-title'),
        content = document.querySelector('.app-content'),
        search = document.getElementById('app-search'),
        selectedLabel = this.liveElement.textContent.replace(/^\s+|\s+$/g, ''),
        selectedView = selected === 'configuracion' ? 'configuracion' : 'workspace',
        workspaceRegions = document.querySelectorAll('[data-pvsp-workspace-region]'),
        workspaceToolbar = document.querySelectorAll('[data-pvsp-workspace-toolbar]'),
        i,
        link,
        isSelected;

      if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
      }

      if (!selected) {
        return;
      }

      for (i = 0; i < links.length; i++) {
        link = links[i];
        isSelected = link.getAttribute('data-pvsp-section') === selected;

        if (isSelected) {
          link.setAttribute('aria-current', 'page');
        }
        else {
          link.removeAttribute('aria-current');
        }
      }

      if (content) {
        content.setAttribute('data-pvsp-active-section', selected);
      }

      if (title) {
        title.textContent = selectedLabel;
      }

      if (search) {
        search.setAttribute('placeholder', 'Buscar en ' + selectedLabel.toLowerCase());
      }

      for (i = 0; i < views.length; i++) {
        if (views[i].getAttribute('data-pvsp-view') === selectedView) {
          views[i].setAttribute('data-hidden', 'no');
        }
        else {
          views[i].setAttribute('data-hidden', '');
        }
      }

      for (i = 0; i < workspaceRegions.length; i++) {
        workspaceRegions[i].setAttribute('data-hidden', selectedView === 'workspace' ? 'no' : '');
      }

      for (i = 0; i < workspaceToolbar.length; i++) {
        if (selectedView === 'workspace') {
          workspaceToolbar[i].removeAttribute('data-hidden');
        }
        else {
          workspaceToolbar[i].setAttribute('data-hidden', '');
        }
      }
    }
  };

  _handlers('commons', appHandlers).start();

  (function setAccordionDefaults() {
    var
      isMobile = window.innerWidth <= 760,
      contents = document.querySelectorAll('[data-pvsp-accordion-content]'),
      toggles = document.querySelectorAll('[data-pvsp-accordion-toggle]'),
      i;

    for (i = 0; i < contents.length; i++) {
      contents[i].setAttribute('data-hidden', isMobile ? '' : 'no');
    }

    for (i = 0; i < toggles.length; i++) {
      if (isMobile) {
        toggles[i].removeAttribute('data-selected');
      }
      else {
        toggles[i].setAttribute('data-selected', 'no');
      }
    }
  }());
}());
