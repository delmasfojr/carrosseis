/* Guarda o app no celular para abrir rápido (e sem internet, menos a parte do Gemini).
   Arquivos do app: busca a versão nova e cai na guardada se estiver sem internet.
   Desenhos, mascote e fontes: usa o guardado (não mudam). */
const CACHE = 'carrosseis-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;  // Gemini passa direto
  const fixo = /\/(desenhos|mascote|fontes|vendor)\//.test(u.pathname);
  e.respondWith(caches.open(CACHE).then(async c => {
    const guardado = await c.match(e.request);
    if (fixo && guardado) return guardado;
    try {
      const r = await fetch(e.request);
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      if (guardado) return guardado;
      throw err;
    }
  }));
});
