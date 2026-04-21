    // js/tweaks.js — depends on: none (reads/writes DOM + localStorage)
    // Theme/density/bible-visibility persistence. Default theme = "auto":
    // follows the device's prefers-color-scheme (dark → Line Check, light → Mise).
    // Users can pin a theme via the Tweaks panel, which stops tracking the OS.

    var TWEAK_KEY = 'dtTweaks';
    var TWEAK_DEFAULTS = { theme: 'auto', density: 'comfy', bibleMode: 'strip' };
    var tweaks = Object.assign({}, TWEAK_DEFAULTS);
    var darkMql = null;
    var darkListener = null;

    function loadTweaks() {
      try {
        var raw = localStorage.getItem(TWEAK_KEY);
        if (raw) {
          var saved = JSON.parse(raw);
          if (saved && typeof saved === 'object') {
            tweaks = Object.assign({}, TWEAK_DEFAULTS, saved);
          }
        }
      } catch (e) {}
    }

    function saveTweaks() {
      try { localStorage.setItem(TWEAK_KEY, JSON.stringify(tweaks)); } catch (e) {}
    }

    function resolvedTheme() {
      if (tweaks.theme === 'mise' || tweaks.theme === 'line') return tweaks.theme;
      // auto: follow OS
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'line';
      return 'mise';
    }

    function applyThemeColor(theme) {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (!meta) return;
      meta.setAttribute('content', theme === 'line' ? '#0d0d0d' : '#f3ece0');
    }

    function applyAll() {
      var theme = resolvedTheme();
      document.documentElement.setAttribute('data-theme', theme);
      document.documentElement.setAttribute('data-density', tweaks.density);
      applyThemeColor(theme);

      // Bible visibility
      var bible = document.getElementById('bible');
      if (bible) {
        bible.classList.remove('hidden');
        if (tweaks.bibleMode === 'off') {
          bible.classList.add('hidden');
        } else if (tweaks.bibleMode === 'open') {
          bible.classList.add('open');
          var head = document.getElementById('bibleHead');
          if (head) head.setAttribute('aria-expanded', 'true');
          var toggle = bible.querySelector('.bible-head .toggle');
          if (toggle) toggle.textContent = 'Collapse';
        }
        // 'strip' = leave as-is, starts collapsed
      }

      // Highlight the active button in each group
      var panel = document.getElementById('tweaksPanel');
      if (panel) {
        var btns = panel.querySelectorAll('.tweak-options button');
        for (var i = 0; i < btns.length; i++) {
          var b = btns[i];
          var g = b.dataset.group;
          var v = b.dataset.value;
          b.classList.toggle('active', tweaks[g] === v);
        }
      }
    }

    function watchSystemDark() {
      if (!window.matchMedia) return;
      darkMql = window.matchMedia('(prefers-color-scheme: dark)');
      darkListener = function() { if (tweaks.theme === 'auto') applyAll(); };
      if (darkMql.addEventListener) darkMql.addEventListener('change', darkListener);
      else if (darkMql.addListener) darkMql.addListener(darkListener);
    }

    function setTweak(group, value) {
      if (!(group in TWEAK_DEFAULTS)) return;
      tweaks[group] = value;
      saveTweaks();
      applyAll();
    }

    (function initTweaks() {
      loadTweaks();
      applyAll();
      watchSystemDark();

      // Gear toggle
      var gear = document.getElementById('tweaksToggle');
      var panel = document.getElementById('tweaksPanel');
      if (gear && panel) {
        gear.classList.add('visible');
        gear.addEventListener('click', function() {
          panel.classList.toggle('open');
        });
      }

      // Option buttons
      if (panel) {
        panel.addEventListener('click', function(e) {
          var btn = e.target.closest('button[data-group][data-value]');
          if (!btn) return;
          setTweak(btn.dataset.group, btn.dataset.value);
        });
      }
    })();
