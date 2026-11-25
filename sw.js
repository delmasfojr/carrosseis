/* Guarda sÃ³ as telas do app no celular (para abrir mesmo com internet ruim).
   Fontes, desenhos, mascote e biblioteca NÃƒO passam por aqui: no Android isso travava o desenho dos cards.
   O prÃ³prio navegador guarda esses arquivos no cache dele. */
const CACHE = 'carrosseis-v34';
const TELAS = /\/(|index\.html|app\.js|concursos\.js|estudo\.js|estudo\.json|cards\.js|roteiro\.js|youtube\.js|gravador\.js|voz-nucleo\.mjs|voz-worker\.mjs|tinta\.js|estudio\.html|estudio\.js|estudio-remoto\.js|editor\.js|aparelho\.html|cola\.html|aparelho\.js|prompt\.md|prompt-roteiro\.md|prompt-desenhos\.md|desenhos\.json|gatilhos\.json|questoes\.json|manifest\.webmanifest)$/;
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || !TELAS.test(u.pathname)) return;
  e.respondWith((async () => {  // busca a versÃ£o nova; sem internet, usa a guardada
    const c = await caches.open(CACHE);
    try {
      // no-cache: sempre confere com o site, senÃ£o o celular mistura arquivo novo com pÃ¡gina velha
      const r = await fetch(e.request, {cache: 'no-cache'});
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      const guardado = await c.match(e.request);
      if (guardado) return guardado;
      throw err;
    }
  })());
});
