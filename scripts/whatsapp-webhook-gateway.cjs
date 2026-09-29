const http = require('node:http');

const webhookPath = '/api/whatsapp/webhook';
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url || '/', 'http://localhost').pathname;
  if (pathname !== webhookPath || !['GET', 'POST'].includes(request.method || '')) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const upstream = http.request({
    hostname: '127.0.0.1',
    port: Number(process.env.PORT || 3333),
    method: request.method,
    path: request.url,
    headers: { ...request.headers, host: `127.0.0.1:${process.env.PORT || 3333}` },
  }, upstreamResponse => {
    response.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on('error', () => {
    if (!response.headersSent) response.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Webhook upstream unavailable');
  });
  request.pipe(upstream);
});

server.listen(3334, '127.0.0.1', () => console.log('WhatsApp webhook gateway em http://127.0.0.1:3334'));
