export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Proxy Ativo. Aguardando URL...", { status: 200 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    const MY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Headers para enganar o servidor original
    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv"
    });

    if (cookieFromKV) headers.set("Cookie", cookieFromKV);

    try {
      const response = await fetch(targetUrl, { headers });
      
      // CRIANDO NOVOS HEADERS (Aqui é onde resolvemos a tela preta)
      let newHeaders = new Headers(response.headers);
      
      // REMOVE as travas de segurança do Mangalivre
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      newHeaders.delete("Frame-Options");
      
      // LIBERA o acesso para o seu site ler o conteúdo
      newHeaders.set("Access-Control-Allow-Origin", "*");
      newHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

      const contentType = response.headers.get("Content-Type") || "";

      // Se for imagem ou arquivo de sistema, entrega direto
      if (!contentType.includes("text/html")) {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, { status: response.status, headers: newHeaders });
      }

      // Se for HTML, reescrevemos as imagens internas para usarem seu proxy também
      let body = await response.text();
      const proxyBase = `${url.origin}/?url=`;

      // Força imagens e links a passarem pelo seu proxy
      body = body.replace(/(https?:\/\/(cdn\.mangalivre\.tv|aws\.r2d2storage\.com)[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match)}`;
      });

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro no Worker: " + e.message, { status: 500 });
    }
  }
};
