// /Users/js/Projekte/Vexfit/app/vexfit/sw-verwaltung.js
//
// Teil A: Service Worker NUR für die geschützte Verwaltung. Er wird mit einem
// engen Geltungsbereich registriert (nur der geheime Verwaltungs-Pfad), damit er
// keine öffentlichen Seiten kontrolliert.
//
// Zwei Aufgaben:
//   1. Push-Mitteilungen anzeigen (push) und beim Antippen die Verwaltung an der
//      richtigen Stelle öffnen (notificationclick, Deep-Link aus der Nachricht).
//   2. Die reine HÜLLE der Verwaltungsseite offline bereithalten – und sonst
//      NICHTS. Es werden KEINE Daten zwischengespeichert: Supabase-Antworten
//      (REST/Auth/Functions) werden nie abgefangen oder gecacht, damit nie
//      veraltete oder fremde Daten erscheinen.

const HUELLE_CACHE = "vexfit-admin-huelle-v1";

self.addEventListener("install", (event) => {
  // Nur die Seiten-Hülle (das HTML selbst) vorhalten.
  event.waitUntil(
    caches.open(HUELLE_CACHE)
      .then((c) => c.add("verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html"))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((namen) =>
      Promise.all(namen.filter((n) => n !== HUELLE_CACHE).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Fremde Quellen (vor allem Supabase: REST, Auth, Functions) NIE anfassen –
  // keine Daten cachen, immer direkt ans Netz.
  if (url.origin !== self.location.origin || url.hostname.endsWith("supabase.co")) return;
  // Nur die Seiten-Navigation (die Hülle) bedienen: Netz zuerst, Hülle als
  // Rückfall offline. Die Hülle enthält keine Daten.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((antwort) => {
          const kopie = antwort.clone();
          caches.open(HUELLE_CACHE).then((c) => c.put(event.request, kopie)).catch(() => {});
          return antwort;
        })
        .catch(() => caches.match("verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html")),
    );
  }
});

self.addEventListener("push", (event) => {
  let daten = { titel: "Vexfit Admin", text: "", url: "verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html" };
  try { if (event.data) daten = Object.assign(daten, event.data.json()); } catch (_e) { /* roher Text ignorieren */ }
  event.waitUntil(
    self.registration.showNotification(daten.titel || "Vexfit Admin", {
      body: daten.text || "",
      icon: "marke/favicon-192.png",
      badge: "marke/favicon-192.png",
      data: { url: daten.url || "verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html" },
      tag: "vexfit-admin",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const ziel = (event.notification.data && event.notification.data.url) ||
    "verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenster) => {
      // Ein offenes Verwaltungsfenster fokussieren und zum Deep-Link navigieren.
      for (const f of fenster) {
        if (f.url.includes("verwaltung-88fd2cb35d54e09c68c8e60199d97b66.html") && "focus" in f) {
          f.navigate ? f.navigate(ziel) : null;
          return f.focus();
        }
      }
      return self.clients.openWindow(ziel);
    }),
  );
});
