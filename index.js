export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const mangaId = url.searchParams.get('manga');
    const debug = url.searchParams.get('debug') === 'true';

    if (!targetUrl) {
      return new Response("Erro: Use ?url=LINK", { status: 400 });
    }

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    const MY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const isAjax = targetUrl.includes('admin-ajax.php');
    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif|bmp|svg)(\?.*)?$/i) || targetUrl.includes('r2d2storage.com');

    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
    });

    if (isImage) {
      headers.set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8");
      headers.set("Referer", "https://mangalivre.tv/");
      headers.set("Origin", "https://mangalivre.tv");
      headers.set("Sec-Fetch-Dest", "image");
      headers.set("Sec-Fetch-Mode", "no-cors");
      headers.set("Sec-Fetch-Site", "cross-site");
    } else {
      headers.set("Referer", "https://mangalivre.tv/");
      headers.set("Origin", "https://mangalivre.tv");
      if (cookieFromKV) headers.set("Cookie", cookieFromKV);
      
      if (isAjax) {
        headers.set("X-Requested-With", "XMLHttpRequest");
        headers.set("Sec-Fetch-Mode", "cors");
      } else {
        headers.set("Sec-Fetch-Mode", "navigate");
        headers.set("Upgrade-Insecure-Requests", "1");
      }
    }

    headers.delete("cf-connecting-ip");
    headers.delete("x-forwarded-for");

    try {
      let fetchOptions = {
        method: isAjax ? 'POST' : 'GET',
        headers: headers,
        redirect: 'follow',
      };

      if (isAjax && mangaId) {
        headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        const formData = new URLSearchParams();
        formData.append('action', 'manga_get_chapters');
        formData.append('manga', mangaId);
        fetchOptions.body = formData.toString();
      }

      const response = await fetch(targetUrl, fetchOptions);

      // MODO DEBUG
      if (debug) {
        const responseHeaders = {};
        response.headers.forEach((v, k) => { responseHeaders[k] = v; });
        return new Response(JSON.stringify({
          url: targetUrl,
          status: response.status,
          headers: responseHeaders,
          isImage,
          cookiePresent: !!cookieFromKV
        }, null, 2), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
      }

      // TRATAMENTO DE IMAGEM
      if (isImage) {
        const imageBuffer = await response.arrayBuffer();
        return new Response(imageBuffer, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get('content-type') || "image/webp",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400"
          }
        });
      }

      // TRATAMENTO DE HTML / AJAX
      let body = await response.text();
      
      if (!isAjax) {
        // Substituição inteligente das imagens do R2D2
        const r2d2Regex = /(https?:\/\/[^"'\s]*r2d2storage\.com[^"'\s]*\.(webp|jpg|jpeg|png|gif|avif)[^"'\s]*)/gi;
        body = body.replace(r2d2Regex, (match) => {
          return `${url.origin}?url=${encodeURIComponent(match)}`;
        });
      }

      // IMPORTANTE: Criamos novos headers para limpar bloqueios de Iframe (X-Frame-Options)
      const finalHeaders = new Headers();
      finalHeaders.set("Content-Type", response.headers.get('content-type') || "text/html; charset=UTF-8");
      finalHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(body, { status: response.status, headers: finalHeaders });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
  }
};
        
