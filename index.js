export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) return new Response("Use ?url=LINK", { status: 400 });

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    const MY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif)/i) || targetUrl.includes('storage');

    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Cookie": cookieFromKV || "",
      "Referer": "https://mangalivre.tv/", // Crucial para o storage liberar a imagem
      "Origin": "https://mangalivre.tv"
    });

    // Limpeza de rastros de bot
    headers.delete("cf-connecting-ip");
    headers.delete("x-forwarded-for");

    try {
      const response = await fetch(targetUrl, { headers });
      const contentType = response.headers.get("Content-Type") || "";

      // SE FOR IMAGEM (AWS R2D2 Storage ou CDN)
      if (isImage || contentType.includes("image")) {
        const imageRes = new Response(response.body, response);
        imageRes.headers.set("Access-Control-Allow-Origin", "*");
        imageRes.headers.set("Cache-Control", "public, max-age=604800");
        return imageRes;
      }

      // SE FOR O HTML DA PÁGINA
      let body = await response.text();
      const proxyBase = `https://${url.hostname}/?url=`;

      // --- REGEX PODEROSA: CAPTURA AWS R2D2 E OUTROS ---
      // Esta linha encontra qualquer link de imagem (webp, jpg, etc) e joga pro seu proxy
      body = body.replace(/(https?:)?\/\/([^\s"']+\.(webp|jpg|jpeg|png))/gi, (match) => {
        // Se já tiver o proxy na frente, ignora. Se não, adiciona.
        if (match.includes(url.hostname)) return match;
        return `${proxyBase}${match.startsWith('//') ? 'https:' + match : match}`;
      });

      // Injeta um script para forçar a exibição caso o JS do site tente bloquear
      body = body.replace('</head>', `<style>img{max-width:100%!important; height:auto!important; display:block!important; margin:10px auto!important;}</style></head>`);

      return new Response(body, {
        headers: { "Content-Type": "text/html; charset=UTF-8", "Access-Control-Allow-Origin": "*" }
      });

    } catch (e) {
      return new Response("Erro: " + e.message, { status: 500 });
    }
  }
};
