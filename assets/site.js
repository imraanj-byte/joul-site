/* Joul Online Services: kleine hulpjes. Zonder dit script blijft de pagina volledig leesbaar. */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };

  /* jaartal in de voet */
  var jaar = $('#jaar');
  if (jaar) jaar.textContent = new Date().getFullYear();

  /* menu op smalle schermen */
  var nav = $('#nav'), burger = $('#burger');
  function menu(open) {
    if (!nav || !burger) return;
    nav.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? 'Menu sluiten' : 'Menu openen');
  }
  if (burger) {
    burger.addEventListener('click', function () { menu(!nav.classList.contains('open')); });
    $$('#navlinks a').forEach(function (a) { a.addEventListener('click', function () { menu(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') menu(false); });
  }

  /* rekensom */
  var r1 = $('#r1');
  if (r1) {
    var eur = new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
    var eurNb = function (v) { return eur.format(v).replace(/\s/g, '\u00a0'); };
    var r2 = $('#r2'), r3 = $('#r3'), r4 = $('#r4'), laatste = {};
    /* prijs en naam van het eerste pakket staan in data-attributen op #calc; zonder echte prijs verdwijnt de terugverdienregel */
    var calcEl = $('#calc');
    var prijs = parseFloat(String((calcEl && calcEl.getAttribute('data-prijs')) || '').replace(',', '.'));
    var heeftPrijs = isFinite(prijs) && prijs > 0;
    var pakketNaam = (calcEl && calcEl.getAttribute('data-naam')) || 'Het eerste pakket';
    var bepRij = $('.bep');
    if (!heeftPrijs && bepRij) bepRij.hidden = true;
    var calc = function () {
      var miss = +r1.value, conv = +r2.value / 100, val = +r3.value, dagen = +r4.value;
      $('#o1').textContent = miss;
      $('#o2').textContent = Math.round(conv * 100) + '%';
      $('#o3').textContent = eurNb(val);
      $('#o4').textContent = dagen;
      var m = miss * conv * val * dagen;
      $('#big').textContent = eurNb(m);
      $('#helft').textContent = eurNb(m / 2);
      if (heeftPrijs) {
        var n = Math.max(1, Math.ceil(prijs / (val || 1)));
        $('#bep').textContent = n + (n === 1 ? ' opdracht' : ' opdrachten');
      }
      laatste = { miss: miss, conv: Math.round(conv * 100), val: val, dagen: dagen, maand: eur.format(m), helft: eur.format(m / 2) };
    };
    [r1, r2, r3, r4].forEach(function (el) { el.addEventListener('input', calc); });
    calc();

    var knop = $('#copyCalc');
    if (knop) knop.addEventListener('click', function () {
      var tekst = 'Rekensom Joul Online Services\n' +
        laatste.miss + ' gemiste oproepen per dag, ' + laatste.conv + '% wordt een opdracht, ' +
        eur.format(laatste.val) + ' per opdracht, ' + laatste.dagen + ' werkdagen per maand\n' +
        'Gemiste omzet: ' + laatste.maand + ' per maand, de helft daarvan is ' + laatste.helft + '\n' +
        (heeftPrijs ? pakketNaam + ': vanaf ' + eur.format(prijs) + ' per maand, btw-vrij (vrijstellingsregeling kleine ondernemingen). ' : '') +
        'Joul Online Services, imraan@joul.eu';
      var klaar = function () {
        var oud = knop.textContent; knop.textContent = 'Gekopieerd';
        setTimeout(function () { knop.textContent = oud; }, 1800);
      };
      var noodgreep = function () {
        var ta = document.createElement('textarea');
        ta.value = tekst; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); klaar(); } catch (e) {}
        document.body.removeChild(ta);
      };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(tekst).then(klaar, noodgreep);
      else noodgreep();
    });
  }

  /* knop bij een pakket: zet het gekozen pakket in het contactformulier */
  $$('[data-interesse]').forEach(function (a) {
    a.addEventListener('click', function () {
      var veld = $('#interesse');
      if (veld) veld.value = a.getAttribute('data-interesse');
    });
  });

  /* contactformulier (Netlify Forms) */
  var f = $('#f');
  if (f) {
    var fout = $('#formErr'), sent = $('#sent');
    var g = function (id) { return (document.getElementById(id).value || '').trim(); };
    var toonFout = function (tekst, velden) {
      fout.textContent = tekst; fout.hidden = false;
      $$('#f .inp').forEach(function (i) { i.classList.remove('bad'); });
      (velden || []).forEach(function (id) { document.getElementById(id).classList.add('bad'); });
      if (velden && velden.length) document.getElementById(velden[0]).focus();
    };
    var wis = function () { fout.hidden = true; $$('#f .inp').forEach(function (i) { i.classList.remove('bad'); }); };
    $$('#f .inp').forEach(function (i) { i.addEventListener('input', wis); });

    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = { naam: g('naam'), bedrijf: g('bedrijf'), tel: g('tel'), mail: g('mail'), sector: g('sector'), msg: g('msg'),
                interesse: g('interesse') };
      if (!d.naam) return toonFout('Vul uw naam in, dan weten we wie we terugbellen.', ['naam']);
      if (!d.tel && !d.mail) return toonFout('Laat een telefoonnummer of e-mailadres achter, anders kunnen we niet antwoorden.', ['tel', 'mail']);
      if (d.mail && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(d.mail)) return toonFout('Dat e-mailadres klopt niet helemaal. Controleer het even.', ['mail']);
      if (d.tel && d.tel.replace(/[^\d]/g, '').length < 8) return toonFout('Dat telefoonnummer lijkt te kort. Voeg gerust het landnummer toe.', ['tel']);
      wis();
      var knop = $('#send'); knop.disabled = true; knop.textContent = 'Versturen';
      var data = new URLSearchParams();
      data.append('form-name', 'quickscan');
      data.append('naam', d.naam); data.append('bedrijf', d.bedrijf); data.append('telefoon', d.tel);
      data.append('email', d.mail); data.append('sector', d.sector); data.append('bericht', d.msg);
      data.append('interesse', d.interesse);
      var klaar = function (tekst) {
        knop.disabled = false; knop.textContent = 'Verstuur aanvraag';
        $('#sentTxt').textContent = tekst; sent.classList.add('on');
      };
      var mislukt = function () {
        var body = 'Aanvraag Quick-Scan\n\nNaam: ' + d.naam + '\nBedrijf: ' + d.bedrijf + '\nSector: ' + d.sector +
          '\nTelefoon: ' + d.tel + '\nE-mail: ' + d.mail + '\n\nInteresse in: ' + d.interesse +
          '\n\nSituatie:\n' + (d.msg || '-');
        klaar('De verzending liep mis. Bel gerust naar 0468 31 46 51, of verstuur de aanvraag per e-mail: uw e-mailprogramma opent met dezelfde tekst.');
        window.location.href = 'mailto:imraan@joul.eu?subject=' + encodeURIComponent('Quick-Scan aanvraag: ' + (d.bedrijf || d.naam)) + '&body=' + encodeURIComponent(body);
      };
      fetch('/', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: data.toString() })
        .then(function (r) { if (r.ok) klaar('Imraan antwoordt u persoonlijk.'); else mislukt(); })
        .catch(mislukt);
    });
    $('#again').addEventListener('click', function () {
      sent.classList.remove('on'); f.reset(); wis(); document.getElementById('naam').focus();
    });
  }
})();
