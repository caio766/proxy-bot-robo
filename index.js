export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Proxy Ativo.", { status: 200 });

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

      if (isImage) {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, { status: response.status, headers: newHeaders });
      }

      let body = await response.text();
      const proxyBase = `${url.origin}/?url=`;

      body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match)}`;
      });

      // --- INJEÇÃO DO SCRIPT SNIPER (MAIS FORTE QUE CSS) ---
      const cleanScript = `
        <script>
          (function() {
            const clearInterface = () => {
              // Procura o container das imagens que identificamos (reading-content ou manga-safe-wrapper)
              const mangaContainer = document.querySelector('.reading-content') || document.querySelector('#manga-safe-wrapper');
              
              if (mangaContainer) {
                // Remove TUDO do corpo do site
                document.body.innerHTML = '';
                // Adiciona apenas as imagens de volta
                document.body.appendChild(mangaContainer);
                
                // Aplica estilo básico para fundo preto e centralização
                document.body.style.backgroundColor = 'black';
                document.body.style.margin = '0';
                mangaContainer.style.display = 'block';
                mangaContainer.style.margin = '0 auto';
                mangaContainer.style.maxWidth = '1000px';

                // Ajusta as imagens para ficarem visíveis e grandes
                document.querySelectorAll('img').forEach(img => {
                   img.style.display = 'block';
                   img.style.width = '100%';
                   img.style.marginBottom = '10px';
                });
                
                console.log('Limpeza Sniper Concluída');
              }
            };

            // Executa a limpeza várias vezes para garantir que o site original não traga o lixo de volta
            window.addEventListener('load', clearInterface);
            setTimeout(clearInterface, 500);
            setTimeout(clearInterface, 2000);
            setTimeout(clearInterface, 5000);
          })();
        </script>
        <style>
          /* Esconde tudo inicialmente via CSS para evitar o "flash" do site original */
          body { background: black !important; }
          header, footer, .sidebar, .manga-discussion, .nav-links { display: none !important; }
        </style>
      `;

      // Insere o script e o estilo no final do cabeçalho
      body = body.replace('</head>', `${cleanScript}</head>`);

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro: " + e.message, { status: 500 });
    }
  }
};
