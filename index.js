export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Proxy Ativo.", { status: 200 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    
    // MANTIDO: O seu User Agent que funcionou
    const MY_USER_AGENT = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";

    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('storage');

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

    if (cookieFromKV) {
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
      newHeaders.set("Access-Control-Allow-Origin", "*");

      if (isImage) {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, { status: response.status, headers: newHeaders });
      }

      let body = await response.text();
      const proxyBase = `${url.origin}/?url=`;

      // Sua reescrita de imagens (MANTIDA)
      body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match.trim())}`;
      });

      // --- O NOVO FILTRO (INJEÇÃO DE CSS SEGURO) ---
      const readerStyle = `
        <style>
          /* 1. Esconde elementos de interface sem removê-los do código (evita erros de JS) */
          header, footer, .main-header, .site-footer, .c-sidebar, .sidebar, 
          .comments-area, #disqus_thread, .nav-links, .manga-setup, .breadcrumb,
          .top-header, .bottom-header, #adblock-overlay, .ads, .ad-banner {
            display: none !important;
            opacity: 0 !important;
            pointer-events: none !important;
          }

          /* 2. Força o fundo a ser preto e limpa o layout */
          body, html {
            background: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow-x: hidden !important;
          }

          /* 3. Expande o container que você encontrou para a tela toda */
          .reading-content, #manga-safe-wrapper, .chapter-images {
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            display: block !important;
            visibility: visible !important;
          }

          /* 4. Garante que as imagens fiquem gigantes e uma embaixo da outra */
          .wp-manga-chapter-img {
            display: block !important;
            width: 100% !important;
            max-width: 900px !important; /* Tamanho ideal para leitura */
            height: auto !important;
            margin: 0 auto 10px auto !important;
            border: none !important;
          }
        </style>
      `;

      // Inserimos o estilo logo antes de fechar o </head>
      body = body.replace('</head>', `${readerStyle}</head>`);

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro: " + e.message, { status: 500 });
    }
  }
};
        
