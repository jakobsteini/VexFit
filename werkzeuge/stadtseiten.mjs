#!/usr/bin/env node
// ============================================================================
// Vexfit - Stadtseiten erzeugen (SEO)
//
// Liest alle freigeschalteten Trainer (aktiv=true) mit dem oeffentlichen
// Schluessel - derselbe Zugriff, den suche.html im Browser macht, mit
// denselben oeffentlich sichtbaren Spalten. Gruppiert nach Stadt und erzeugt
// fuer jede Stadt mit mindestens SCHWELLE Trainern eine fertige HTML-Datei
// personal-trainer-<stadt>.html im Hauptverzeichnis. Seiten von Staedten,
// die unter die Schwelle gefallen oder verschwunden sind, werden geloescht.
// Zusaetzlich werden sitemap.xml und die Stadt-Links im Fussbereich von
// index.html und suche.html (zwischen den STADTSEITEN-Markern) gepflegt.
//
// Aufruf:  node werkzeuge/stadtseiten.mjs
//
// DIE SCHWELLE IST NICHT VERHANDELBAR: Seiten, die auf ein Suchwort
// zugeschnitten sind, aber kaum Inhalt haben, wertet Google als Verstoss
// und kann dafuer die gesamte Domain abwerten. Deshalb gibt es keinen
// Schalter, der sie senkt oder umgeht.
// ============================================================================

import { readFileSync, writeFileSync, unlinkSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASIS = 'https://vexfit.app';
const SCHWELLE = 3;

// Oeffentlicher (anon) Schluessel - steht in jeder Seite des Repos, kein Geheimnis.
const SUPABASE_URL = 'https://hbapzwxdehfgnputrfjf.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYXB6d3hkZWhmZ25wdXRyZmpmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NDc0NzQsImV4cCI6MjA5NDQyMzQ3NH0.vIQLcTObF5tmBEuxKL2EEUd4U88k0mdTmsAafG8djN4';

// Genau die Spalten, die suche.html oeffentlich anzeigt - nichts darueber hinaus.
const SPALTEN = 'id,created_at,vorname,nachname,stadt,plz,trainingsart,erfahrung,spezialisierungen,bio,preis_stunde,preis_monat,zertifikate,calendly,avatar_url,aktiv';

// Wie in suche.html: als Profilbild gilt nur eine Adresse aus dem eigenen Behaelter.
const AVATAR_PREFIX = SUPABASE_URL + '/storage/v1/object/public/avatars/';

// Seiten, die nicht in die sitemap gehoeren: admin.html ist in robots.txt
// ausgeschlossen, 404.html ist die Fehlerseite von GitHub Pages.
const SITEMAP_AUSSCHLUSS = new Set(['admin.html', '404.html']);

export function slug(stadt) {
  return stadt.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function avatarAdresse(u) {
  return (typeof u === 'string' && u.indexOf(AVATAR_PREFIX) === 0) ? u : null;
}

// Trainerkarte - derselbe Aufbau wie renderTrainers in suche.html, nur als
// echter Link statt onclick, damit Suchmaschinen dem Profil folgen koennen.
const BG_FARBEN = [
  'linear-gradient(135deg,#1a1a1a,#2a2a2a)',
  'linear-gradient(135deg,#1e1a0a,#2a2800)',
  'linear-gradient(135deg,#0a1a1a,#002a2a)',
  'linear-gradient(135deg,#1a0a1a,#2a002a)',
  'linear-gradient(135deg,#0a0a1a,#00002a)',
  'linear-gradient(135deg,#1a1500,#2a2200)',
];

export function trainerKarte(t, i) {
  const initialen = escapeHtml(((t.vorname || '?')[0] + (t.nachname || '?')[0]).toUpperCase());
  const istOnline = t.trainingsart === 'Online';
  const tags = (t.spezialisierungen || []).slice(0, 3);
  const preis = t.preis_stunde ? `€${escapeHtml(t.preis_stunde)}<span>/Std</span>`
    : t.preis_monat ? `€${escapeHtml(t.preis_monat)}<span>/Mo</span>` : '<span>Auf Anfrage</span>';
  const bild = avatarAdresse(t.avatar_url);
  const ciStyle = bild ? `background-image:url('${escapeHtml(bild)}');background-size:cover;background-position:center` : `background:${BG_FARBEN[i % BG_FARBEN.length]}`;
  return `
      <a class="tc" href="profil.html?id=${escapeHtml(t.id)}">
        <div class="ci" style="${ciStyle}">
          ${bild ? '' : `<div class="cav">${initialen}</div>`}
          <div class="cbadge ${istOnline ? 'online' : ''}">
            ${istOnline ? 'Online' : 'Verifiziert ✓'}
          </div>
        </div>
        <div class="cb">
          <div class="cn">${escapeHtml(t.vorname)} ${escapeHtml(t.nachname)}</div>
          <div class="cl">${istOnline ? '🌐 Online · DACH-weit' : '📍 ' + escapeHtml(t.stadt) + ' · ' + escapeHtml(t.trainingsart)}</div>
          <div class="ctags">${tags.map(tag => `<span class="ctag">${escapeHtml(tag)}</span>`).join('')}</div>
          <div class="cf">
            <div class="cp">${preis}</div>
            <div class="cr">⭐ Neu</div>
          </div>
        </div>
      </a>`;
}

// Einleitung nur aus echten Werten: Anzahl, vorkommende Spezialisierungen,
// tatsaechliche Preisspanne. Keine Werbefloskeln.
export function einleitung(stadt, trainer) {
  const saetze = [`Auf Vexfit sind derzeit ${trainer.length} Personal Trainer in ${stadt} gelistet.`];
  const spez = [...new Set(trainer.flatMap(t => t.spezialisierungen || []))];
  if (spez.length) saetze.push(`Vertretene Spezialisierungen: ${spez.join(', ')}.`);
  const preise = trainer.map(t => t.preis_stunde).filter(p => p != null && p !== '');
  if (preise.length) {
    const min = Math.min(...preise), max = Math.max(...preise);
    saetze.push(min === max ? `Preis pro Stunde: €${min}.` : `Preise pro Stunde: €${min} bis €${max}.`);
  }
  return saetze.map(escapeHtml).join(' ');
}

export function jsonLd(stadt, trainer) {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Personal Trainer in ${stadt}`,
    numberOfItems: trainer.length,
    itemListElement: trainer.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `${t.vorname} ${t.nachname}`,
      url: `${BASIS}/profil.html?id=${t.id}`,
    })),
  }, null, 1);
}

// Komplette Stadtseite. Kopf, Karten, Fussbereich, Cookie-Banner und Pixel
// sind aus suche.html uebernommen - gleiche Schriften, Farben, Abstaende.
export function stadtseiteHtml(stadt, trainer) {
  const s = escapeHtml(stadt);
  const datei = `personal-trainer-${slug(stadt)}.html`;
  const titel = `Personal Trainer ${s} – Vexfit`;
  const beschreibung = escapeHtml(`${trainer.length} verifizierte Personal Trainer in ${stadt} – Profile mit Spezialisierungen und Preisen auf Vexfit ansehen.`);
  const karten = trainer.map((t, i) => trainerKarte(t, i)).join('\n');
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<link rel="icon" type="image/png" href="vexfit-logo.png">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titel}</title>
<meta name="description" content="${beschreibung}">
<link rel="canonical" href="${BASIS}/${datei}">
<meta property="og:type" content="website">
<meta property="og:title" content="${titel}">
<meta property="og:description" content="${beschreibung}">
<meta property="og:image" content="${BASIS}/vexfit-logo.png">
<meta property="og:url" content="${BASIS}/${datei}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${titel}">
<meta name="twitter:description" content="${beschreibung}">
<meta name="twitter:image" content="${BASIS}/vexfit-logo.png">
<link rel="stylesheet" href="fonts/vexfit-fonts.css">
<style>
:root{--black:#0a0a0a;--white:#f5f5f0;--accent:#e8ff00;--gray:#141414;--mid:#1e1e1e;--card:#161616;--text-muted:#666;--border:rgba(255,255,255,0.07);--border-input:rgba(255,255,255,0.12)}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{background:var(--black);color:var(--white);font-family:'DM Sans',sans-serif;-webkit-font-smoothing:antialiased}
.logo{font-family:'Bebas Neue',sans-serif;font-size:26px;letter-spacing:4px;color:var(--white);text-decoration:none}
.logo span{color:var(--accent)}
nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:rgba(10,10,10,0.92);backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.nav-r{display:flex;gap:12px;align-items:center}
.nav-link{color:var(--text-muted);text-decoration:none;font-size:13px;transition:color 0.2s}
.nav-link:hover{color:var(--white)}
.nav-cta{background:var(--accent);color:var(--black);padding:9px 16px;border-radius:3px;font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;text-decoration:none}
.search-hero{padding:80px 20px 32px;background:var(--gray);border-bottom:1px solid var(--border)}
.sh-label{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--accent);font-weight:600;margin-bottom:8px}
.sh-title{font-family:'Bebas Neue',sans-serif;font-size:clamp(36px,8vw,60px);line-height:0.95;letter-spacing:2px;margin-bottom:24px}
.sh-intro{font-size:14px;color:var(--text-muted);line-height:1.7;max-width:640px}
.main-content{padding:24px 20px}
.results-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.rc{font-size:14px;color:var(--text-muted)}
.rc strong{color:var(--white)}
.umkreis-hinweis{margin-top:28px;font-size:13px;color:var(--text-muted)}
.umkreis-hinweis a{color:var(--accent);text-decoration:none}
.grid{display:grid;grid-template-columns:1fr;gap:3px}
.tc{background:var(--card);cursor:pointer;position:relative;overflow:hidden;transition:background 0.3s;color:inherit;text-decoration:none;display:block}
.tc:hover{background:var(--mid)}
.tc::before{content:'';position:absolute;bottom:0;left:0;right:0;height:2px;background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform 0.35s}
.tc:hover::before{transform:scaleX(1)}
.ci{height:160px;display:flex;align-items:center;justify-content:center;position:relative}
.cav{font-family:'Bebas Neue',sans-serif;font-size:52px;letter-spacing:2px;color:rgba(232,255,0,0.3)}
.cbadge{position:absolute;top:12px;left:12px;background:var(--accent);color:var(--black);padding:3px 8px;border-radius:2px;font-size:9px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase}
.cbadge.online{background:rgba(232,255,0,0.15);color:var(--accent);border:1px solid rgba(232,255,0,0.3)}
.cb{padding:18px}
.cn{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:1.5px;margin-bottom:4px}
.cl{font-size:12px;color:var(--text-muted);margin-bottom:10px}
.ctags{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:12px}
.ctag{padding:3px 8px;background:rgba(255,255,255,0.06);border-radius:100px;font-size:11px;color:var(--text-muted)}
.cf{display:flex;justify-content:space-between;align-items:center;padding-top:12px;border-top:1px solid var(--border)}
.cp{font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--accent);letter-spacing:1px}
.cp span{font-family:'DM Sans',sans-serif;font-size:11px;color:var(--text-muted);letter-spacing:0}
.cr{font-size:12px;color:var(--text-muted)}
footer{border-top:1px solid var(--border);padding:32px 20px 88px;text-align:center;margin-top:40px}
.footer-logo{font-family:'Bebas Neue',sans-serif;font-size:20px;letter-spacing:4px;color:var(--white);text-decoration:none;display:block;margin-bottom:16px}
.footer-logo span{color:var(--accent)}
.footer-links{display:flex;flex-wrap:wrap;gap:14px;justify-content:center;margin-bottom:12px}
.footer-links a{font-size:12px;color:var(--text-muted);text-decoration:none}
footer p{font-size:12px;color:var(--text-muted)}
@media(min-width:768px){
  nav{padding:18px 52px}
  .search-hero{padding:110px 52px 40px}
  .main-content{padding:32px 52px}
  .grid{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
  footer{padding:32px 52px;display:flex;justify-content:space-between;align-items:center;text-align:left}
  .footer-logo{display:inline;margin-bottom:0}
  .footer-links{margin-bottom:0}
}
</style>
<!-- Meta Pixel Code -->
<!-- Laedt NICHT beim Seitenaufruf. Nur wenn eine Zustimmung fuer Marketing vorliegt. -->
<script>
function vexfitPixelLaden(){
  if(window.VEXFIT_PIXEL_GELADEN) return;
  window.VEXFIT_PIXEL_GELADEN = true;
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', '1034036285801133');
  fbq('track', 'PageView');
}
try {
  if(localStorage.getItem('vexfit_consent') === 'zugestimmt') vexfitPixelLaden();
} catch(e) {}
</script>
<!-- End Meta Pixel Code -->
<script type="application/ld+json">
${jsonLd(stadt, trainer)}
</script>
</head>
<body>

<nav>
  <a href="index.html" class="logo">VEX<span>FIT</span></a>
  <div class="nav-r">
    <a href="login.html" class="nav-link">Login</a>
    <a href="registrieren.html" class="nav-cta">Registrieren</a>
  </div>
</nav>

<div class="search-hero">
  <div class="sh-label">Personal Trainer</div>
  <h1 class="sh-title">PERSONAL TRAINER<br>${s.toUpperCase()}</h1>
  <p class="sh-intro">${einleitung(stadt, trainer)}</p>
</div>

<div class="main-content">
  <div class="results-header">
    <div class="rc"><strong>${trainer.length} Trainer</strong> in ${s}</div>
  </div>
  <div class="grid">
${karten}
  </div>
  <p class="umkreis-hinweis">Du wohnst nicht direkt in ${s}? <a href="suche.html">Zur Suche im Umkreis →</a></p>
</div>

<footer>
  <a href="index.html" class="footer-logo">VEX<span>FIT</span></a>
  <p>© 2026 Vexfit</p>
  <div class="footer-links">
    <a href="rechtliches.html">Impressum</a>
    <a href="rechtliches.html#datenschutz">Datenschutz</a>
    <a href="rechtliches.html#agb">AGB</a>
      <a href="#" onclick="return vexfitEinstellungenOeffnen()">Cookie-Einstellungen</a>
  </div>
</footer>
<!-- Zustimmung fuer Marketing. Gleicher Aufbau und gleiche Gestaltung auf allen Seiten. -->
<style>
.cookie-banner{position:fixed;bottom:0;left:0;right:0;z-index:10000;background:#141414;border-top:1px solid rgba(255,255,255,0.07);padding:16px 20px;display:none;flex-direction:column;gap:12px;animation:vxSlideUp 0.5s ease both;font-family:'DM Sans',sans-serif}
.cookie-banner.show{display:flex}
.cookie-text{font-size:13px;color:#666;line-height:1.6}
.cookie-text a{color:#e8ff00;text-decoration:none}
.cookie-actions{display:flex;gap:10px}
.btn-cookie-ok{flex:1;background:#e8ff00;color:#0a0a0a;padding:12px;border:none;border-radius:3px;font-family:'DM Sans',sans-serif;font-weight:700;font-size:12px;text-transform:uppercase;cursor:pointer}
.btn-cookie-no{flex:1;background:transparent;color:#666;padding:12px;border:1px solid rgba(255,255,255,0.07);border-radius:3px;font-family:'DM Sans',sans-serif;font-size:12px;cursor:pointer}
@keyframes vxSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
</style>
<div class="cookie-banner" id="cookieBanner">
  <div class="cookie-text">&#127850; Wir verwenden Cookies. <a href="rechtliches.html">Datenschutz</a></div>
  <div class="cookie-actions">
    <button class="btn-cookie-no" onclick="vexfitAblehnen()">Nur n&ouml;tige</button>
    <button class="btn-cookie-ok" onclick="vexfitZustimmen()">Akzeptieren &#10003;</button>
  </div>
</div>
<script>
// Drei Zustaende in vexfit_consent: kein Wert = noch nicht gefragt, "abgelehnt", "zugestimmt".
// Nur bei "noch nicht gefragt" erscheint der Banner.
function vexfitWhatsappZeigen(an){
  var k = document.querySelectorAll('.wa-btn, .wa');
  for(var i=0;i<k.length;i++) k[i].style.display = an ? '' : 'none';
}
function vexfitBannerZeigen(){
  var b = document.getElementById('cookieBanner');
  if(!b) return;
  b.classList.add('show');
  vexfitWhatsappZeigen(false);
}
function vexfitBannerSchliessen(){
  var b = document.getElementById('cookieBanner');
  if(b){
    b.style.transition = 'transform 0.4s';
    b.style.transform = 'translateY(100%)';
    setTimeout(function(){ b.classList.remove('show'); }, 400);
  }
  vexfitWhatsappZeigen(true);
}
function vexfitEinstellungenOeffnen(){
  try { localStorage.removeItem('vexfit_consent'); } catch(e) {}
  var b = document.getElementById('cookieBanner');
  if(b){ b.style.transition = ''; b.style.transform = ''; }
  vexfitBannerZeigen();
  return false;
}
function vexfitZustimmen(){
  try { localStorage.setItem('vexfit_consent','zugestimmt'); } catch(e) {}
  if(typeof vexfitPixelLaden === 'function') vexfitPixelLaden();
  vexfitBannerSchliessen();
}
function vexfitAblehnen(){
  try { localStorage.setItem('vexfit_consent','abgelehnt'); } catch(e) {}
  vexfitBannerSchliessen();
}
(function(){
  var stand = null;
  try { stand = localStorage.getItem('vexfit_consent'); } catch(e) {}
  if(stand !== 'zugestimmt' && stand !== 'abgelehnt') vexfitBannerZeigen();
})();
</script>
</body>
</html>
`;
}

// ──── sitemap.xml ────
function sitemapXml() {
  const seiten = readdirSync(REPO)
    .filter(f => f.endsWith('.html') && !SITEMAP_AUSSCHLUSS.has(f))
    .sort();
  const eintraege = seiten.map(f => `  <url><loc>${BASIS}/${f}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${eintraege}\n</urlset>\n`;
}

// ──── Stadt-Links im Fussbereich ────
const MARKER_ANFANG = '<!-- STADTSEITEN-ANFANG: wird von werkzeuge/stadtseiten.mjs gepflegt, nicht von Hand aendern -->';
const MARKER_ENDE = '<!-- STADTSEITEN-ENDE -->';

function fussblock(staedte) {
  if (!staedte.length) return '';
  const links = staedte.map(st => `<a href="personal-trainer-${slug(st)}.html">${escapeHtml(st)}</a>`).join('\n    ');
  return `\n  <div class="footer-links"><span style="font-size:12px;color:var(--text-muted)">Trainer nach Stadt:</span>\n    ${links}\n  </div>`;
}

function fussblockEinsetzen(datei, block) {
  const pfad = join(REPO, datei);
  const quelle = readFileSync(pfad, 'utf8');
  const anfang = quelle.indexOf(MARKER_ANFANG);
  const ende = quelle.indexOf(MARKER_ENDE);
  if (anfang === -1 || ende === -1 || ende < anfang) {
    console.log(`  WARNUNG: Marker in ${datei} nicht gefunden - Fussbereich nicht angepasst.`);
    return false;
  }
  const neu = quelle.slice(0, anfang + MARKER_ANFANG.length) + block + '\n  ' + quelle.slice(ende);
  if (neu !== quelle) { writeFileSync(pfad, neu); return true; }
  return false;
}

// ──── Hauptlauf ────
async function main() {
  const antwort = await fetch(`${SUPABASE_URL}/rest/v1/trainers?aktiv=eq.true&select=${SPALTEN}&order=created_at.desc`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!antwort.ok) {
    console.error(`FEHLER: Trainer konnten nicht geladen werden (HTTP ${antwort.status}). Es wurde nichts geaendert.`);
    process.exit(1);
  }
  const trainer = await antwort.json();
  if (!Array.isArray(trainer)) {
    console.error('FEHLER: Unerwartete Antwort der Datenbank. Es wurde nichts geaendert.');
    process.exit(1);
  }
  console.log(`Freigeschaltete Trainer in der Datenbank: ${trainer.length}`);

  // Nach Stadt gruppieren. Trainer ohne Stadt und die Alt-Angabe "Online"
  // (kein Ort) bekommen keine Stadtseite; die Behandlung reiner
  // Online-Trainer ist bewusst nicht Teil dieses Werkzeugs.
  const proStadt = new Map();
  let uebersprungen = 0;
  for (const t of trainer) {
    const stadt = (t.stadt || '').trim();
    if (!stadt || stadt.toLowerCase() === 'online') { uebersprungen++; continue; }
    if (!proStadt.has(stadt)) proStadt.set(stadt, []);
    proStadt.get(stadt).push(t);
  }
  if (uebersprungen) console.log(`Ohne Stadtangabe oder "Online" (keine Stadtseite): ${uebersprungen}`);

  const erreicht = [...proStadt.entries()].filter(([, ts]) => ts.length >= SCHWELLE)
    .sort((a, b) => a[0].localeCompare(b[0], 'de'));
  const verfehlt = [...proStadt.entries()].filter(([, ts]) => ts.length < SCHWELLE)
    .sort((a, b) => b[1].length - a[1].length);

  // Seiten schreiben.
  const angelegt = [], aktualisiert = [], unveraendert = [];
  const sollDateien = new Set();
  for (const [stadt, ts] of erreicht) {
    const datei = `personal-trainer-${slug(stadt)}.html`;
    sollDateien.add(datei);
    const inhalt = stadtseiteHtml(stadt, ts);
    const pfad = join(REPO, datei);
    if (!existsSync(pfad)) { writeFileSync(pfad, inhalt); angelegt.push(`${datei} (${ts.length} Trainer)`); }
    else if (readFileSync(pfad, 'utf8') !== inhalt) { writeFileSync(pfad, inhalt); aktualisiert.push(`${datei} (${ts.length} Trainer)`); }
    else { unveraendert.push(`${datei} (${ts.length} Trainer)`); }
  }

  // Verwaiste Stadtseiten loeschen (Stadt unter der Schwelle oder weg).
  const geloescht = [];
  for (const f of readdirSync(REPO)) {
    if (/^personal-trainer-.+\.html$/.test(f) && !sollDateien.has(f)) {
      unlinkSync(join(REPO, f));
      geloescht.push(f);
    }
  }

  // sitemap.xml und Fussbereichs-Links pflegen.
  writeFileSync(join(REPO, 'sitemap.xml'), sitemapXml());
  const staedte = erreicht.map(([stadt]) => stadt);
  const fussGeaendert = ['index.html', 'suche.html']
    .filter(d => fussblockEinsetzen(d, fussblock(staedte)));

  // Zusammenfassung.
  console.log('\n──── ERGEBNIS ────');
  console.log(`Angelegt (${angelegt.length}):     ${angelegt.join(', ') || 'keine'}`);
  console.log(`Aktualisiert (${aktualisiert.length}): ${aktualisiert.join(', ') || 'keine'}`);
  console.log(`Unveraendert (${unveraendert.length}): ${unveraendert.join(', ') || 'keine'}`);
  console.log(`Geloescht (${geloescht.length}):    ${geloescht.join(', ') || 'keine'}`);
  console.log(`Schwelle (${SCHWELLE}) verfehlt: ${verfehlt.length ? verfehlt.map(([s, ts]) => `${s} (${ts.length})`).join(', ') : 'keine Stadt'}`);
  console.log(`sitemap.xml neu geschrieben; Fussbereich angepasst in: ${fussGeaendert.join(', ') || 'keiner Datei (schon aktuell)'}`);
  if (!erreicht.length) {
    console.log(`\nKeine Stadt erreicht derzeit ${SCHWELLE} freigeschaltete Trainer - es wurde keine einzige Stadtseite angelegt.`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
