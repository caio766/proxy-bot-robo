export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    
    // Tenta pegar a URL de todas as formas possíveis
    let targetUrl = url.searchParams.get('url');
    
    // Se falhar, tenta pegar direto da string de busca
    if (!targetUrl && url.search) {
      const params = new URLSearchParams(url.search);
      targetUrl = params.get('url');
    }

    // Se ainda falhar, tenta quebrar o link manualmente (Último recurso)
    if (!targetUrl && request.url.includes('url=')) {
      targetUrl = request.url.split('url=')[1];
    }

    // --- BLOCO DE DIAGNÓSTICO ---
    if (!targetUrl) {
      return new Response(`Diagnóstico: O Proxy está vivo, mas não detectou a URL. 
      Link recebido: ${request.url}
      Caminho: ${url.pathname}
      Busca: ${url.search}`, { 
        status: 200, 
        headers: { 'Content-Type': 'text/plain; charset=utf-8' } 
      });
    }

    // Limpa a URL caso ela tenha vindo suja
    try {
      targetUrl = decodeURIComponent(targetUrl).trim();
    } catch (e) {}

    // Validação básica de URL
    if (!targetUrl.startsWith('http')) {
      return new Response("Erro: A URL fornecida não é válida ou não começa com http/https", { status: 400 });
    }

    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET', headers: {} });

    // Lógica de Cache (HIT)
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      const responseWithHeader = new Response(cachedResponse.body, cachedResponse);
      responseWithHeader.headers.set('X-Cache-Status', 'HIT');
      return responseWithHeader;
    }

    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif)/i) || targetUrl.includes('storage');

    try {
      const response = await fetch(targetUrl, { 
        method: 'GET',
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "*/*",
          "Referer": "https://mangalivre.tv/",
          "Origin": "https://mangalivre.tv"
        },
        redirect: "follow"
      });

      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('X-Cache-Status', 'MISS');
      
      // Se for imagem, força o cache agressivo
      if (isImage) {
        newHeaders.set('Cache-Control', 'public, max-age=7776000, immutable');
      }

      const finalResponse = new Response(response.body, {
        status: response.status,
        headers: newHeaders
      });

      ctx.waitUntil(cache.put(cacheKey, finalResponse.clone()));
      return finalResponse;

    } catch (e) {
      return new Response(`Erro ao buscar a imagem: ${e.message}`, { status: 500 });
    }
  }
};
