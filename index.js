export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const mangaId = url.searchParams.get('manga');

    if (!targetUrl) return new Response("Erro: Use ?url=LINK", { status: 400 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    const MY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('r2d2storage.com');

    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv"
    });

    if (cookieFromKV && !isImage) headers.set("Cookie", cookieFromKV);

    try {
      const response = await fetch(targetUrl, { 
        method: request.method, 
        headers: headers,
        body: request.method === 'POST' ? await request.clone().text() : undefined
      });

      // --- PASSO 1: CLONAR E LIMPAR HEADERS DE SEGURANÇA ---
      let newHeaders = new Headers(response.headers);
      
      // Remove as travas que impedem o site de aparecer no seu Iframe
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      newHeaders.delete("Frame-Options");
      
      // Libera o CORS para o seu site conseguir ler os dados
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      newHeaders.set("Access-Control-Allow-Headers", "*");

      // --- PASSO 2: TRATAR O CONTEÚDO ---
      if (isImage) {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, { status: response.status, headers: newHeaders });
      }

      let body = await response.text();
      const proxyBase = `${url.origin}/?url=`;

      // Reescreve URLs de imagens para passarem pelo seu proxy (evita hotlink block no seu site)
      body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match)}`;
      });

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro no Worker: " + e.message, { status: 500 });
    }
  }
};
                            
