// Renders getemix.com/changelog from /changelog.json, which the edge serves
// from the production app (/api/changelog): the same reviewed release notes
// the app shows in What's New, published when a release is deployed.
(function () {
  var SECTIONS = [
    ['new', 'New'], ['improved', 'Improved'], ['fixed', 'Fixed'],
    ['performance', 'Performance'], ['security', 'Security'],
  ];
  var root = document.getElementById('releases');
  if (!root) return;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function formatDate(iso) {
    var d = new Date(iso + 'T12:00:00Z');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  }

  function fail() {
    root.textContent = '';
    var p = el('p', 'changelog-status', 'The changelog could not be loaded right now. Please try again in a moment, or see the ');
    var a = el('a', null, 'releases page');
    a.href = 'https://github.com/hazyrealm/emix/releases';
    p.appendChild(a);
    p.appendChild(document.createTextNode('.'));
    root.appendChild(p);
  }

  fetch('/changelog.json', { headers: { Accept: 'application/json' } })
    .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
    .then(function (data) {
      var releases = (data && data.releases) || [];
      root.textContent = '';
      if (!releases.length) { root.appendChild(el('p', 'changelog-status', 'No updates have been published yet.')); return; }
      releases.forEach(function (rel, i) {
        var card = el('article', 'release' + (i === 0 ? ' release-latest' : ''));
        card.id = 'v' + rel.version;
        var head = el('header', 'release-head');
        var title = el('h2', null, 'Version ' + rel.version);
        head.appendChild(title);
        if (i === 0) head.appendChild(el('span', 'release-badge', 'Latest'));
        var time = el('time', 'release-date', formatDate(rel.date));
        time.setAttribute('datetime', rel.date);
        head.appendChild(time);
        card.appendChild(head);
        if (rel.title) card.appendChild(el('p', 'release-title', rel.title));
        if (rel.summary) card.appendChild(el('p', 'release-summary', rel.summary));
        SECTIONS.forEach(function (s) {
          var items = rel.sections && rel.sections[s[0]];
          if (!items || !items.length) return;
          var block = el('section', 'release-section');
          block.appendChild(el('h3', 'chip chip-' + s[0], s[1]));
          var ul = el('ul');
          items.forEach(function (item) {
            var text = typeof item === 'string' ? item : item && item.text;
            if (!text) return;
            var li = el('li', null, text);
            if (item && typeof item === 'object' && typeof item.image === 'string' && /^\/changelog\/[A-Za-z0-9._-]+$/.test(item.image)) {
              var img = el('img', 'release-shot');
              img.src = 'https://app.getemix.com' + item.image;
              img.alt = '';
              img.loading = 'lazy';
              li.appendChild(img);
            }
            ul.appendChild(li);
          });
          block.appendChild(ul);
          card.appendChild(block);
        });
        root.appendChild(card);
      });
    })
    .catch(fail);
})();
