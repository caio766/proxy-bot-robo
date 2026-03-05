export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const mangaId = url.searchParams.get('manga');

    if (!targetUrl) return new Response("Erro: Use ?url=LINK", { status: 400 });

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
      newHeaders.delete("Frame-Options");
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      newHeaders.set("Access-Control-Allow-Headers", "*");

      if (isImage) {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, { status: response.status, headers: newHeaders });
      }

      let body = await response.text();
      const proxyBase = `${url.origin}/?url=`;

      body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match)}`;
      });

      // --- FILTRO REFEITO (MAIS SEGURO) ---
      const styleFilter = `
        <style>
          /* 1. Esconde apenas elementos específicos que sabemos que são lixo */
          header, footer, .main-header, .site-footer, 
          .comments-area, #disqus_thread, .sidebar, 
          .nav-links, .manga-setup, .breadcrumb,
          #adblock-overlay, #ad-bait-pixel, .ads, .ad-banner {
            display: none !important;
            height: 0 !important;
            overflow: hidden !important;
          }

          /* 2. Força o fundo a ser preto */
          body, html {
            background: #000 !important;
            color: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          /* 3. Garante que o container que você achou fique visível e centralizado */
          .reading-content, #manga-safe-wrapper, .chapter-images {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 100% !important;
            max-width: 1000px !important;
            margin: 0 auto !important;
          }

          /* 4. Ajusta as imagens para não estourarem a tela */
          .wp-manga-chapter-img {
            display: block !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 auto !important;
          }
        </style>
      `;

      body = body.replace('</head>', `${styleFilter}</head>`);

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro no Worker: " + e.message, { status: 500 });
    }
  }
};
                        
