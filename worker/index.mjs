const redirect = "http://127.0.0.1:43821/callback";
function json(data, status = 200) {
  return Response.json(data, {status, headers: {"Cache-Control": "no-store"}});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET")
      return json({ready: Boolean(env.CLIENT_ID && env.CLIENT_SECRET)}, env.CLIENT_ID && env.CLIENT_SECRET ? 200 : 503);
    if (url.pathname !== "/oauth/token" || url.search) return json({error: "not_found"}, 404);
    if (request.method !== "POST") return json({error: "method"}, 405);
    if (request.headers.get("Content-Type")?.split(";")[0] !== "application/x-www-form-urlencoded")
      return json({error: "content_type"}, 415);
    const size = Number(request.headers.get("Content-Length"));
    if (!Number.isInteger(size) || size <= 0 || size > 8192) return json({error: "size"}, 413);
    if (!(await env.LOGIN_LIMIT.limit({key: request.headers.get("CF-Connecting-IP") || "unknown"})).success)
      return json({error: "rate_limit"}, 429);
    if (!env.CLIENT_ID || !env.CLIENT_SECRET) return json({error: "configuration"}, 503);

    const input = new URLSearchParams(await request.text());
    const grant = input.get("grant_type");
    const fields = grant === "authorization_code" ? ["code", "code_verifier"] :
      grant === "refresh_token" ? ["refresh_token"] : [];
    if (!fields.length || input.size !== fields.length + 1 || fields.some(k => !input.get(k)))
      return json({error: "invalid_request"}, 400);
    const form = new URLSearchParams({grant_type: grant, client_id: env.CLIENT_ID, client_secret: env.CLIENT_SECRET});
    for (const field of fields) form.set(field, input.get(field));
    if (grant === "authorization_code") {
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(form.get("code_verifier"))) return json({error: "invalid_verifier"}, 400);
      form.set("redirect_uri", redirect);
    }
    try {
      const upstream = await fetch("https://secure.soundcloud.com/oauth/token", {
        method: "POST", body: form, headers: {Accept: "application/json"}, redirect: "manual"
      });
      if (upstream.status >= 300 && upstream.status < 400) return json({error: "upstream_redirect"}, 502);
      if (!upstream.ok) return json({error: "token_exchange"}, upstream.status);
      const {access_token, refresh_token, expires_in} = await upstream.json();
      if (!access_token || !refresh_token) return json({error: "upstream_response"}, 502);
      return json({access_token, refresh_token, expires_in});
    } catch {
      return json({error: "upstream_unavailable"}, 502);
    }
  }
};
