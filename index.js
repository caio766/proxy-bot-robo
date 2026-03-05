export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Proxy Ativo.", { status: 200 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    const MY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('storage');

    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv",
      "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "Sec-Fetch-Dest": isImage ? "image" : "document",
      "Sec-Fetch-Mode": isImage ? "no-cors" : "navigate",
      "Sec-Fetch-Site": "cross-site",
      "Upgrade-Insecure-Requests": "1"
    });

    if (cookieFromKV) headers.set("Cookie", cookieFromKV);

    try {
      const response = await fetch(targetUrl, { headers, redirect: "follow" });
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

      // 1. Reescreve as imagens para passarem pelo Proxy
      body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match.trim())}`;
      });

      // 2. INJEÇÃO DO FILTRO DE LEITURA (O segredo do visual limpo)
      const readerStyle = `
        <style>
          /* Esconde TUDO do site original */
          header, footer, .main-header, .site-footer, .comments-area, 
          .sidebar, .manga-setup, .nav-links, #disqus_thread, 
          .c-sidebar, .ads, .ad-banner, .box-ad { 
            display: none !important; 
          }

          /* Garante que o fundo seja preto e foque no conteúdo */
          body { 
            background: #000 !important; 
            margin: 0 !important; 
            padding: 0 !important; 
          }

          /* Centraliza o conteúdo da leitura */
          .reading-content, .chapter-images {
            width: 100% !important;
            max-width: 900px !important;
            margin: 0 auto !important;
            display: block !important;
          }

          /* Força as imagens a ocuparem a tela corretamente */
          .wp-manga-chapter-img {
            width: 100% !important;
            height: auto !important;
            margin-bottom: 5px !important;
            display: block !important;
          }

          /* MATA O AVISO DE ADBLOCK */
          #adblock-overlay { display: none !important; }
          #manga-safe-wrapper { display: block !important; visibility: visible !important; }
        </style>
      `;

      // Insere o estilo antes do fechamento do </head>
      body = body.replace('</head>', `${readerStyle}</head>`);

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro: " + e.message, { status: 500 });
    }
  }
};
        
