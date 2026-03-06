export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const purge = url.searchParams.get('purge');

    if (!targetUrl) return new Response("Proxy Sniper Ativo.", { status: 200 });

    const cache = caches.default;
    // A chave do cache deve ser apenas a URL de destino para evitar conflitos
    const cacheKey = new Request(url.toString(), {
      method: "GET",
      headers: request.headers
    });
    
    if (purge !== 'true') {
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) return cachedResponse;
    }

    const MY_USER_AGENT = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('storage');

    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Accept": isImage ? "image/avif,image/webp,*/*" : "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv"
    });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    if (cookieFromKV) headers.set("Cookie", cookieFromKV);

    try {
      const response = await fetch(targetUrl, { method: "GET", headers });

      if (response.status === 403) return new Response("Bloqueio Cloudflare (403)", { status: 403 });

      // --- TRATAMENTO DE CABEÇALHOS PARA MATAR O MAX-AGE=0 ---
      let newHeaders = new Headers(response.headers);
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      newHeaders.delete("Set-Cookie"); // Cookies de terceiros impedem o cache
      newHeaders.set("Access-Control-Allow-Origin", "*");
      
      // FORÇAR 90 DIAS AQUI (A ordem absoluta para a Cloudflare)
      const cacheTime = "7776000"; // 90 dias
      newHeaders.set("Cache-Control", `public, max-age=${cacheTime}, s-maxage=${cacheTime}, immutable`);
      newHeaders.set("Cloudflare-CDN-Cache-Control", `max-age=${cacheTime}`);

      let finalResponse;

      if (isImage) {
        const buffer = await response.arrayBuffer();
        finalResponse = new Response(buffer, { status: response.status, headers: newHeaders });
      } else {
        let body = await response.text();
        // Usando o seu domínio personalizado para as rotas internas
        const proxyBase = `https://proxy.nuvoxtoons.xyz/?url=`;

        body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
          return `${proxyBase}${encodeURIComponent(match)}`;
        });

        // --- SEU SCRIPT SNIPER (MANTIDO) ---
        const cleanScript = `
          <script>
            (function() {
              const clearInterface = () => {
                const mangaContainer = document.querySelector('.reading-content') || document.querySelector('#manga-safe-wrapper');
                if (mangaContainer) {
                  document.body.innerHTML = '';
                  document.body.appendChild(mangaContainer);
                  document.body.style.backgroundColor = 'black';
                  document.body.style.margin = '0';
                  mangaContainer.style.display = 'block';
                  mangaContainer.style.margin = '0 auto';
                  mangaContainer.style.maxWidth = '1000px';
                  document.querySelectorAll('img').forEach(img => {
                     img.style.display = 'block'; img.style.width = '100%'; img.style.marginBottom = '10px';
                  });
                }
              };
              window.addEventListener('load', clearInterface);
              setTimeout(clearInterface, 500);
              setTimeout(clearInterface, 2000);
            })();
          </script>
          <style>
            body { background: black !important; }
            header, footer, .sidebar, .manga-discussion, .nav-links { display: none !important; }
          </style>`;
        
        body = body.replace('</head>', `${cleanScript}</head>`);
        finalResponse = new Response(body, { status: response.status, headers: newHeaders });
      }

      // Salva no cache antes de retornar
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
      return finalResponse;

    } catch (e) {
      return new Response("Erro Sniper: " + e.message, { status: 500 });
    }
  }
};
