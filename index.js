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
      "Accept-Encoding": "gzip, deflate, br",
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv",
      "DNT": "1",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": isImage ? "image" : "document",
      "Sec-Fetch-Mode": isImage ? "no-cors" : "navigate",
      "Sec-Fetch-Site": "cross-site",
      "Connection": "keep-alive"
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
        return new Response("Bloqueio Cloudflare (403): O IP deste Worker pode estar na lista negra ou o cookie expirou.", { status: 403 });
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

      // Injeta script de filtro melhorado apenas em HTML
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        const filterScript = `
<script>
(function() {
  console.log('🎯 Script de filtro do proxy iniciado');

  function aplicarFiltro() {
    const container = document.querySelector('.reading-content');
    if (!container) {
      console.warn('⚠️ Elemento .reading-content não encontrado. Tentando novamente em 1s...');
      setTimeout(aplicarFiltro, 1000);
      return;
    }
    console.log('✅ Contêiner encontrado:', container);

    // Salva o container e limpa o body
    const novoConteudo = container.cloneNode(true);
    document.body.innerHTML = '';
    document.body.appendChild(novoConteudo);

    // Adiciona estilo
    const style = document.createElement('style');
    style.textContent = \`
      body {
        margin: 0;
        padding: 20px;
        background: #0a0a0a;
        display: flex;
        justify-content: center;
      }
      .reading-content {
        max-width: 800px;
        width: 100%;
        background: #1a1a1a;
        padding: 15px;
        border-radius: 10px;
        box-shadow: 0 0 20px rgba(0,0,0,0.5);
      }
      .reading-content img {
        display: block;
        max-width: 100%;
        height: auto;
        margin: 15px auto;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      }
    \`;
    document.head.appendChild(style);

    console.log('🎉 Filtro aplicado com sucesso!');
  }

  // Tenta aplicar assim que o DOM estiver pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', aplicarFiltro);
  } else {
    aplicarFiltro();
  }
})();
</script>
        `;
        // Insere antes do fechamento </body>
        body = body.replace('</body>', filterScript + '</body>');
      }

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro: " + e.message, { status: 500 });
    }
  }
};
