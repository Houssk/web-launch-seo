// Analytics relay: /ingest/* on the site is forwarded to the analytics vendor (EU region).
// Deployed as a Cloudflare Worker route in front of the static site.
const UPSTREAM = 'https://eu.analytics.example.com';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const upstream = new URL(url.pathname.replace(/^\/ingest/, '') || '/', UPSTREAM);
    upstream.search = url.search;
    const response = await fetch(upstream, {
      method: request.method,
      headers: request.headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    });
    return new Response(response.body, { status: response.status, headers: response.headers });
  },
};
