export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');
    const mangaId = url.searchParams.get('manga');
    const debug = url.searchParams.get('debug') === 'true'; // Ativar debug

    if (!targetUrl) {
      return new Response("Erro: Use ?url=LINK", { status: 400 });
    }

    const cookieFromKV = await env.mangalivre_session.get("mangalivre_cookie");
    
    // User-Agent de Chrome 120 no Windows (completo)
    const MY_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

    const isAjax = targetUrl.includes('admin-ajax.php');
    const isImage = targetUrl.match(/\.(webp|jpg|jpeg|png|gif|avif|bmp|svg)(\?.*)?$/i) || targetUrl.includes('r2d2storage.com');

    // Headers base (comuns a todas requisições)
    const headers = new Headers({
      "User-Agent": MY_USER_AGENT,
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Accept-Encoding": "gzip, deflate, br", // Importante: alguns CDNs exigem
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Connection": "keep-alive", // Simular conexão persistente
      "sec-ch-ua": "\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": "\"Windows\"",
    });

    // Configuração específica por tipo
    if (isImage) {
      headers.set("Accept", "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8");
      headers.set("Referer", "https://mangalivre.tv/"); // ESSENCIAL
      headers.set("Origin", "https://mangalivre.tv");
      headers.set("Sec-Fetch-Dest", "image");
      headers.set("Sec-Fetch-Mode", "no-cors");
      headers.set("Sec-Fetch-Site", "cross-site");
      // Alguns CDNs verificam se a requisição é feita de uma página "segura"
      headers.set("Sec-Fetch-User", "?1"); // Indica que foi iniciado pelo usuário
    } else if (isAjax) {
      headers.set("Accept", "*/*");
      headers.set("Referer", "https://mangalivre.tv/");
      headers.set("Origin", "https://mangalivre.tv");
      headers.set("X-Requested-With", "XMLHttpRequest");
      headers.set("Sec-Fetch-Dest", "empty");
      headers.set("Sec-Fetch-Mode", "cors");
      headers.set("Sec-Fetch-Site", "same-origin");
      if (cookieFromKV) headers.set("Cookie", cookieFromKV);
    } else {
      // Página HTML
      headers.set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8");
      headers.set("Referer", "https://mangalivre.tv/");
      headers.set("Origin", "https://mangalivre.tv");
      headers.set("Sec-Fetch-Dest", "document");
      headers.set("Sec-Fetch-Mode", "navigate");
      headers.set("Sec-Fetch-Site", "same-origin");
      headers.set("Upgrade-Insecure-Requests", "1");
      if (cookieFromKV) headers.set("Cookie", cookieFromKV);
    }

    // Remove headers problemáticos da Cloudflare
    headers.delete("cf-connecting-ip");
    headers.delete("x-forwarded-for");
    headers.delete("x-real-ip");

    try {
      let fetchOptions = {
        method: isAjax ? 'POST' : 'GET',
        headers: headers,
        redirect: 'follow',
        // Importante: não seguir redirecionamentos automaticamente para debug
        // Mas vamos manter follow para simplificar
      };

      if (isAjax && mangaId) {
        headers.set("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8");
        const formData = new URLSearchParams();
        formData.append('action', 'manga_get_chapters');
        formData.append('manga', mangaId);
        fetchOptions.body = formData.toString();
      }

      // FAZ A REQUISIÇÃO
      const response = await fetch(targetUrl, fetchOptions);

      // --- MODO DEBUG: retorna informações detalhadas ---
      if (debug) {
        const responseHeaders = {};
        response.headers.forEach((value, key) => { responseHeaders[key] = value; });
        
        // Tenta ler o body como texto (se for imagem, vai dar erro, mas podemos tentar buffer)
        let bodyPreview = "";
        try {
          if (isImage) {
            const buffer = await response.arrayBuffer();
            bodyPreview = `[Imagem] Tamanho: ${buffer.byteLength} bytes`;
          } else {
            bodyPreview = (await response.text()).substring(0, 500);
          }
        } catch (e) {
          bodyPreview = `Erro ao ler body: ${e.message}`;
        }

        return new Response(JSON.stringify({
          url: targetUrl,
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
          bodyPreview: bodyPreview,
          isImage: isImage,
          cookiePresent: !!cookieFromKV
        }, null, 2), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // --- FLUXO NORMAL ---
      if (isImage) {
        const imageBuffer = await response.arrayBuffer();
        
        // Verifica se a resposta foi bem-sucedida
        if (!response.ok) {
          return new Response(`Erro ao carregar imagem: ${response.status} ${response.statusText}`, { status: response.status });
        }

        return new Response(imageBuffer, {
          status: response.status,
          headers: {
            "Content-Type": response.headers.get('content-type') || "image/webp",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=86400",
            "Content-Length": imageBuffer.byteLength.toString()
          }
        });
      }

      // Processa HTML
      let body = await response.text();
      
      // Substitui URLs de imagens do r2d2storage para passar pelo proxy
      // Regex mais abrangente
      const r2d2Regex = /(https?:\/\/[^"'\s]*r2d2storage\.com[^"'\s]*\.(webp|jpg|jpeg|png|gif|avif)[^"'\s]*)/gi;
      body = body.replace(r2d2Regex, (match) => {
        return `${url.origin}?url=${encodeURIComponent(match)}`;
      });

      // Também substitui em atributos srcset
      body = body.replace(
        /(srcset)="([^"]*r2d2storage\.com[^"]*)"/gi,
        (match, attr, srcsetValue) => {
          // srcset pode conter múltiplas URLs com descrições
          const newSrcset = srcsetValue.replace(r2d2Regex, (imgUrl) => {
            return `${url.origin}?url=${encodeURIComponent(imgUrl)}`;
          });
          return `${attr}="${newSrcset}"`;
        }
      );

      return new Response(body, {
        status: response.status,
        headers: {
          "Content-Type": response.headers.get('content-type') || "text/html; charset=UTF-8",
          "Access-Control-Allow-Origin": "*"
        }
      });

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message, stack: e.stack }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
};
