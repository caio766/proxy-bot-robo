export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // CAPTURA DE URL ROBUSTA: Tenta pelo parâmetro e depois pelo link bruto
    let targetUrl = url.searchParams.get('url');
    if (!targetUrl && request.url.includes('?url=')) {
      targetUrl = request.url.split('?url=')[1];
    }

    const purge = url.searchParams.get('purge');

    // Se não houver URL, mostra o status
    if (!targetUrl) {
      return new Response("Proxy Ativo - Use ?url=https://...", { 
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }

    // Decodifica a URL para evitar erros de caracteres especiais
    try {
      targetUrl = decodeURIComponent(targetUrl);
    } catch (e) {
      // Se falhar na decodificação, usa a original
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET', headers: {} });

    // Lógica de Cache (HIT)
    if (purge !== 'true') {
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const responseWithHeader = new Response(cachedResponse.body, cachedResponse);
        responseWithHeader.headers.set('X-Cache-Status', 'HIT');
        return responseWithHeader;
      }
    }

    // Busca cookie no KV se existir a variável de ambiente
    let cookieFromKV = null;
    if (env.mangalivre_session) {
      cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    }

    const MY_USER_AGENT = "Mozilla/5.0 (Android 13; Mobile; rv:128.0) Gecko/128.0 Firefox/128.0";
    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('storage');

    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Accept": isImage ? "image/avif,image/webp,*/*" : "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.8,en-US;q=0.5,en;q=0.3",
      "Referer": "https://mangalivre.tv/",
      "Origin": "https://mangalivre.tv",
      "DNT": "1"
    });

    if (cookieFromKV) {
      headers.set("Cookie", cookieFromKV);
    }

    try {
      const response = await fetch(targetUrl, { 
        method: 'GET', 
        headers: headers,
        redirect: "follow"
      });

      if (!response.ok) {
        return new Response(`Erro na origem: ${response.status}`, { status: response.status });
      }

      const proxyBase = `${url.origin}/?url=`;
      let finalResponse;

      if (isImage) {
        // TRATAMENTO DE IMAGEM
        const buffer = await response.arrayBuffer();
        const newHeaders = new Headers({
          'Content-Type': response.headers.get('Content-Type') || 'image/webp',
          'Cache-Control': 'public, max-age=7776000, immutable',
          'Access-Control-Allow-Origin': '*',
          'X-Cache-Status': 'MISS'
        });
        
        finalResponse = new Response(buffer, { 
          status: response.status,
          headers: newHeaders
        });
      } else {
        // TRATAMENTO DE TEXTO/HTML (SEM SNIPER)
        let body = await response.text();
        
        // Mantém apenas a substituição de links para o proxy continuar funcional
        body = body.replace(/(["'])(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)(["'])/gi, (match, quote, urlMatch, quote2) => {
          return `${quote}${proxyBase}${encodeURIComponent(urlMatch)}${quote2}`;
        });
        
        body = body.replace(/(https?:\/\/aws\.r2d2storage\.com\/[^\s"']+)/gi, (match) => {
          return `${proxyBase}${encodeURIComponent(match)}`;
        });

        const newHeaders = new Headers({
          'Content-Type': response.headers.get('Content-Type') || 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=7776000, immutable',
          'Access-Control-Allow-Origin': '*',
          'X-Cache-Status': 'MISS'
        });
        
        finalResponse = new Response(body, { 
          status: response.status,
          headers: newHeaders
        });
      }

      // Salva no cache da Cloudflare
      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
      return finalResponse;

    } catch (e) {
      return new Response(`Erro: ${e.message}`, { status: 500 });
    }
  }
};
    
