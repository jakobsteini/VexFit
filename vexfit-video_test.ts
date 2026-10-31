// /Users/js/Projekte/Vexfit/app/vexfit/vexfit-video_test.ts
//
// Prueft die Video-Link-Erkennung (vexfit-video.js): richtige Plattform und
// Einbettungs-Adresse fuer gueltige Links, null fuer ungueltige.
//
// Aufruf:  deno test --allow-read vexfit-video_test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";

const quelle = await Deno.readTextFile(new URL("./vexfit-video.js", import.meta.url));
new Function(quelle)();
// deno-lint-ignore no-explicit-any
const vexVideo = (globalThis as any).vexVideo;

Deno.test("YouTube in allen Schreibweisen -> embed", () => {
  for (const u of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ",
    "youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  ]) {
    const r = vexVideo.erkenne(u);
    assertEquals(r.plattform, "youtube", u);
    assertEquals(r.embed, "https://www.youtube.com/embed/dQw4w9WgXcQ", u);
  }
});

Deno.test("Instagram Beitrag und Reel -> embed", () => {
  assertEquals(
    vexVideo.erkenne("https://www.instagram.com/reel/CxYz12AbcDe/").embed,
    "https://www.instagram.com/p/CxYz12AbcDe/embed",
  );
  assertEquals(vexVideo.erkenne("https://instagram.com/p/ABC123/").plattform, "instagram");
});

Deno.test("TikTok -> embed v2", () => {
  const r = vexVideo.erkenne("https://www.tiktok.com/@max.trainer/video/7312345678901234567");
  assertEquals(r.plattform, "tiktok");
  assertEquals(r.embed, "https://www.tiktok.com/embed/v2/7312345678901234567");
});

Deno.test("Ungueltige Links -> null", () => {
  for (const u of [
    "", "   ", "kein link", "https://example.com/video/1",
    "javascript:alert(1)", "https://vimeo.com/12345",
    "https://youtube.com/watch", "https://instagram.com/maxtrainer",
  ]) {
    assertEquals(vexVideo.erkenne(u), null, JSON.stringify(u));
  }
});

Deno.test("kein Skript-Protokoll wird durchgelassen", () => {
  assert(vexVideo.erkenne("javascript:void(0)") === null);
  assert(vexVideo.erkenne("data:text/html,<b>x</b>") === null);
});
