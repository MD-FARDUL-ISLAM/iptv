// Cloudflare Worker - IPTV CORS & HTTP-to-HTTPS Stream Proxy (Enhanced Stability)
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        }
      });
    }

    if (!targetUrl) {
      return new Response('StreamHub IPTV Proxy is Running!', {
        status: 200,
        headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const proxyOrigin = url.origin;
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        },
        redirect: 'follow'
      });

      const contentType = response.headers.get('Content-Type') || '';
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      newHeaders.delete('Content-Security-Policy');
      newHeaders.delete('X-Frame-Options');

      if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('x-mpegURL')) {
        let playlistText = await response.text();
        const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);

        const rewrittenLines = playlistText.split('\n').map(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            return line.replace(/URI="([^"]+)"/g, (match, uri) => {
              const absUri = new URL(uri, baseUrl).href;
              return `URI="${proxyOrigin}/?url=${encodeURIComponent(absUri)}"`;
            });
          }
          const absoluteSegmentUrl = new URL(trimmed, baseUrl).href;
          return `${proxyOrigin}/?url=${encodeURIComponent(absoluteSegmentUrl)}`;
        });

        newHeaders.set('Content-Type', 'application/vnd.apple.mpegurl');
        return new Response(rewrittenLines.join('\n'), {
          status: response.status,
          headers: newHeaders
        });
      }

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders
      });

    } catch (err) {
      return new Response('Proxy Error: ' + err.message, {
        status: 502,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
