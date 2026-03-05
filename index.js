export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Erro: Use ?url=LINK", { status: 400 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");

    // --- AQUI ESTÁ O SEGREDO ---
    // Substitua o texto abaixo pelo que o console do seu celular mostrou
    const MY_USER_AGENT = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0"; 

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
        return `${proxyBase}${encodeURIComponent(match)}`;
      });

      return new Response(body, { status: response.status, headers: newHeaders });

    } catch (e) {
      return new Response("Erro no Worker: " + e.message, { status: 500 });
    }
  }
};
