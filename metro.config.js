const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const apiPort = Number(process.env.EXPO_PUBLIC_API_PORT || 3001);

config.server = {
  ...config.server,
  enhanceMiddleware: (metroMiddleware) => (request, response, next) => {
    const requestPath = request.url || '/';
    const isApiRequest = requestPath.startsWith('/api/') || requestPath === '/health' || requestPath === '/ready';

    if (!isApiRequest) return metroMiddleware(request, response, next);

    const proxyRequest = http.request(
      {
        hostname: '127.0.0.1',
        port: apiPort,
        path: requestPath,
        method: request.method,
        headers: { ...request.headers, host: `127.0.0.1:${apiPort}` },
      },
      (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode || 502, proxyResponse.headers);
        proxyResponse.pipe(response);
      },
    );

    proxyRequest.on('error', () => {
      if (response.headersSent) return response.end();
      response.writeHead(502, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'RiskRadar backend is unavailable.' }));
    });
    request.pipe(proxyRequest);
  },
};

module.exports = config;
