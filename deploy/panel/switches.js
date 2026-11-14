// Switches that open a built feature to everyone at once (the owner's hard rule "show a feature only when it is on":
// no menu row, step, label, assistant page or help article for something that does not work yet).
// Each is a var of this Worker (wrangler.jsonc vars, or the Cloudflare dashboard). A new value takes effect on the next
// request; the admin app asks GET /api/switches when it opens, when it comes back to the front and every 5 minutes
// (apps/dashboard/src/crm/gympage/pagesOpen.ts), so everything appears together with no reload.
//
// GYM_PAGES = "live": F207 gym web pages are open to visitors (join.mettleup.fit/<gym>, gymPageServe.js). The same
// switch shows the admin app's "Your web page" row and screen, Set up your gym's step, "Asked on your web page" on an
// enquiry, the assistant's "Your web page" page (assistCatalogue.js) and the help article (helpArticles.js).

/** Is the switch named `name` on? Only the value "live" is on; an unknown name, no env or any other value is off. */
export function switchOn(env, name) {
  return typeof name === 'string' && Boolean(env) && env[name] === 'live';
}

/** F207: are gym web pages open to visitors? */
export function gymPagesOpen(env) {
  return switchOn(env, 'GYM_PAGES');
}

/** GET /api/switches: what the admin app may show. Never cached for long: switching on shows within minutes. */
export function switchesAnswer(env) {
  return new Response(JSON.stringify({ gymPages: gymPagesOpen(env) }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
