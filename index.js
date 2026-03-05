export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Proxy Ativo. Aguardando comando...", { status: 200 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    
    // MANTIDO: O seu User Agent real do Firefox 128 (Android 13)
    const MY_USER_AGENT = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";

    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('r2d2storage.com');

    // MANTIDO: Seus headers de bypass que estão funcionando
    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Accept": isImage ? "image/avif,image/webp,*/*" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.8,en-US;q=0.5,en;q=0.3",
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": isImage ? "image" : "document",
      "Sec-Fetch-Mode": isImage ? "no-cors" : "navigate",
      "Sec-Fetch-Site": "cross-site"
    });

    if (cookieFromKV && !isImage) {
      headers.set("Cookie", cookieFromKV);
    }

    try {
      const response = await fetch(targetUrl, { 
        method: request.method, 
        headers: headers,
        redirect: "follow"
      });

      let newHeaders = new Headers(response.headers);
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      newHeaders.delete("Frame-Options");
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

      if (isImage) {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, { status: response.status, headers: newHeaders });
      }

      let body = await response.text();
      const proxyBase = `${url.origin}/?url=`;

      // 1. MANTIDO: Sua troca de URLs da AWS para passar pelo proxy
      body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match.trim())}`;
      });

      // 2. INJEÇÃO DO FILTRO (Baseado no seu Relatório de Estrutura)
      const styleFilter = `
        <style>
          /* Esconde tudo o que não é manga (Menus, Comentários, Popups) */
          #manga-reading-nav-head, .manga-discussion, .site-content > *:not(.c-page-content),
          .modal-content, .entry-header, .site-footer, .ads, .ad-banner, .mnc-content {
            display: none !important;
            visibility: hidden !important;
            height: 0 !important;
            overflow: hidden !important;
          }

          /* Força o fundo preto e limpa bordas */
          body, html {
            background: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* Garante que as imagens e o container principal apareçam */
          .reading-content, #manga-safe-wrapper, .entry-content, .entry-content_wrap {
            display: block !important;
            visibility: visible !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            opacity: 1 !important;
          }

          /* Ajusta a largura das imagens para leitura perfeita */
          .img-responsive, .wp-manga-chapter-img {
            display: block !important;
            width: 100% !important;
            max-width: 900px !important;
            height: auto !important;
            margin: 0 auto 5px auto !important;
          }

          /* Mata o overlay de AdBlock se ele aparecer */
          #adblock-overlay { display: none !important; }
        </style>
      `;

      // Adiciona o CSS no final do <head>
      body = body.replace('</head>', `${styleFilter}</head>`);

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro no Worker: " + e.message, { status: 500 });
    }
  }
};
                          
