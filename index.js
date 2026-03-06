export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const purge = url.searchParams.get('purge'); // Sistema de gerenciamento

    if (!targetUrl) return new Response("Proxy Ativo.", { status: 200 });

    // --- SISTEMA DE CACHE (90 DIAS) ---
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), request);
    
    if (purge !== 'true') {
      let cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) return cachedResponse;
    }

    // --- CONFIGURAÇÕES ORIGINAIS (QUE VOCÊ VALIDOU) ---
    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    const MY_USER_AGENT = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";

    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('storage');

    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Accept": isImage ? "image/avif,image/webp,*/*" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.8,en-US;q=0.5,en;q=0.3",
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv",
      "DNT": "1",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": isImage ? "image" : "document",
      "Sec-Fetch-Mode": isImage ? "no-cors" : "navigate",
      "Sec-Fetch-Site": "cross-site"
    });

    if (cookieFromKV) {
      headers.set("Cookie", cookieFromKV);
    }

    try {
      const response = await fetch(targetUrl, { 
        method: request.method, 
        headers: headers,
        redirect: "follow"
      });

      if (response.status === 403) {
        return new Response("Bloqueio Cloudflare (403)", { status: 403 });
      }

      let newHeaders = new Headers(response.headers);
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      newHeaders.set("Access-Control-Allow-Origin", "*");

      // --- AQUI ENTRA A MÁGICA DO CACHE SEM QUEBRAR O CÓDIGO ---
      // Forçamos 90 dias (7.776.000 segundos) nos cabeçalhos de resposta
      newHeaders.set("Cache-Control", "public, s-maxage=7776000, max-age=7776000, immutable");

      let finalResponse;

      if (isImage) {
        const buffer = await response.arrayBuffer();
        finalResponse = new Response(buffer, { status: response.status, headers: newHeaders });
      } else {
        let body = await response.text();
        // Voltamos para url.origin para evitar erros de domínio
        const proxyBase = `${url.origin}/?url=`;

        body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
          return `${proxyBase}${encodeURIComponent(match)}`;
        });

        // --- SEU SCRIPT SNIPER (TOTALMENTE PRESERVADO) ---
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
                     img.style.display = 'block';
                     img.style.width = '100%';
                     img.style.marginBottom = '10px';
                  });
                }
              };
              window.addEventListener('load', clearInterface);
              setTimeout(clearInterface, 500);
              setTimeout(clearInterface, 2000);
              setTimeout(clearInterface, 5000);
            })();
          </script>
          <style>
            body { background: black !important; }
            header, footer, .sidebar, .manga-discussion, .nav-links { display: none !important; }
          </style>
        `;
        body = body.replace('</head>', `${cleanScript}</head>`);
        finalResponse = new Response(body, { status: response.status, headers: newHeaders });
      }

      // Salva no cache da Cloudflare para as próximas visitas
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
      
      return finalResponse;

    } catch (e) {
      return new Response("Erro: " + e.message, { status: 500 });
    }
  }
};
