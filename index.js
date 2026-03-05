export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Aguardando URL...", { status: 200 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    const MY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    // Detectar se o recurso é uma imagem ou um arquivo de sistema (JS/CSS)
    const isMedia = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif|js|css|woff2)/i) || targetUrl.includes('storage');

    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv"
    });

    if (cookieFromKV && !isMedia) headers.set("Cookie", cookieFromKV);

    try {
      const response = await fetch(targetUrl, { 
        method: request.method, 
        headers: headers,
        body: request.method === 'POST' ? await request.clone().text() : undefined
      });

      let newHeaders = new Headers(response.headers);
      
      // DESBLOQUEIO DE SEGURANÇA (Para rodar no seu site)
      newHeaders.delete("X-Frame-Options");
      newHeaders.delete("Content-Security-Policy");
      newHeaders.delete("Frame-Options");
      newHeaders.set("Access-Control-Allow-Origin", "*");

      const contentType = response.headers.get("Content-Type") || "";

      // SE FOR IMAGEM OU BINÁRIO: Retorna direto o buffer
      if (isMedia || !contentType.includes("text/html")) {
        const buffer = await response.arrayBuffer();
        return new Response(buffer, { status: response.status, headers: newHeaders });
      }

      // SE FOR HTML: Vamos reescrever TODOS os links para passarem pelo seu proxy
      let body = await response.text();
      const proxyBase = `${url.origin}/?url=`;

      // 1. REGEX MESTRE: Captura links do CDN, do Storage R2D2 e links internos do Mangalivre
      // Isso evita que o site "saia" do seu proxy
      body = body.replace(/(https?:\/\/(cdn\.mangalivre\.tv|aws\.r2d2storage\.com)[^\s"']+)/gi, (match) => {
        return `${proxyBase}${encodeURIComponent(match)}`;
      });

      // 2. Injeta um pequeno script para evitar que o site original tente "quebrar" o seu iframe
      // Alguns sites usam scripts para detectar se estão em iframe e redirecionar
      const antiblockScript = `
        <script>
          window.onbeforeunload = function() { return null; };
          // Bloqueia tentativas de 'Frame Busting' (sair do iframe)
          if (window.top !== window.self) {
            window.top.onbeforeunload = function() { return null; };
          }
        </script>
      `;
      body = body.replace('<head>', `<head>${antiblockScript}`);

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro no Worker: " + e.message, { status: 500 });
    }
  }
};
