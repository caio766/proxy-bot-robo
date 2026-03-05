export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Proxy Ativo. Aguardando comando...", { status: 200 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    
    const MY_USER_AGENT = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";

    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('r2d2storage.com');

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

      body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match.trim())}`;
      });

      // --- O NOVO FILTRO SNIPER (Baseado nas suas imagens) ---
      const styleFilter = `
        <style>
          /* 1. ESCONDE O TOPO (Image 2) */
          /* Alvos: Título do capítulo, breadcrumbs e navegação flutuante superior */
          .entry-header, .breadcrumb, .manga-setup, .nav-links.nav-head,
          .header-manga, #manga-reading-nav-head {
            display: none !important;
            height: 0 !important;
            visibility: hidden !important;
          }

          /* 2. ESCONDE O RODAPÉ (Image 1) */
          /* Alvos: Área de comentários, discussão e navegação inferior */
          .comments-area, #disqus_thread, .manga-discussion, 
          .nav-links.nav-foot, .site-footer, .breadcrumb-footer {
            display: none !important;
            height: 0 !important;
            visibility: hidden !important;
          }

          /* 3. LIMPEZA GERAL DE INTERFACE */
          /* Esconde barras laterais, popups e elementos globais de interface do site original */
          header, footer, .main-header, .site-footer, .c-sidebar, .sidebar, 
          .ads, .ad-banner, .top-header, .bottom-header, #adblock-overlay {
            display: none !important;
          }

          /* 4. FOCO NO CONTEÚDO (MANTIDO) */
          /* Força o fundo preto e garante que o container que segura as imagens tome a tela */
          body, html {
            background: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow-x: hidden !important;
          }

          .reading-content, #manga-safe-wrapper, .chapter-images {
            display: block !important;
            visibility: visible !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 auto !important;
            padding: 0 !important;
            opacity: 1 !important;
          }

          /* Ajusta as imagens para leitura perfeita */
          .wp-manga-chapter-img, .img-responsive {
            display: block !important;
            width: 100% !important;
            max-width: 900px !important; /* Largura confortável */
            height: auto !important;
            margin: 0 auto 5px auto !important; /* Espaço pequeno entre páginas */
            border: none !important;
          }
        </style>
      `;

      // Inserimos o estilo logo antes de fechar o </head>
      body = body.replace('</head>', `${styleFilter}</head>`);

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro no Worker: " + e.message, { status: 500 });
    }
  }
};
