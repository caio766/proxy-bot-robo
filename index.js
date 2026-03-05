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

      // Substitui URLs de imagens do storage para passarem pelo proxy
      body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match)}`;
      });

      // Injeta script de filtro apenas em HTML
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        // Script melhorado com MutationObserver
        const filterScript = `
<script>
(function() {
  console.log('🔍 Filtro de capítulo iniciado');

  function aplicarFiltro() {
    const container = document.querySelector('.reading-content');
    if (!container) {
      console.warn('⏳ Aguardando .reading-content...');
      return false;
    }
    console.log('✅ Contêiner encontrado, aplicando filtro');

    // Remove todos os elementos exceto o container
    const novoBody = container.cloneNode(true);
    document.body.innerHTML = '';
    document.body.appendChild(novoBody);

    // Adiciona estilo escuro
    const style = document.createElement('style');
    style.textContent = \`
      body { margin: 0; padding: 20px; background: #0a0a0a; display: flex; justify-content: center; }
      .reading-content { max-width: 800px; width: 100%; background: #1a1a1a; padding: 15px; border-radius: 10px; }
      .reading-content img { display: block; max-width: 100%; height: auto; margin: 10px auto; border-radius: 5px; }
    \`;
    document.head.appendChild(style);

    console.log('🎉 Filtro aplicado!');
    return true;
  }

  // Tenta aplicar imediatamente
  if (!aplicarFiltro()) {
    // Se não encontrou, observa mudanças no DOM
    const observer = new MutationObserver(() => {
      if (aplicarFiltro()) {
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
</script>
        `;
        // Insere antes do fechamento </body> (case insensitive)
        body = body.replace(/(<\/body>)/i, filterScript + '$1');
      }

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro: " + e.message, { status: 500 });
    }
  }
};
