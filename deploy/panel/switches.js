// Switches that open a built feature to everyone at once (the owner's hard rule "show a feature only when it is on":
// no menu row, step, label, assistant page or help article for something that does not work yet).
// Each is a var of this Worker (wrangler.jsonc vars, or the Cloudflare dashboard). A new value takes effect on the next
// request; the admin app asks GET /api/switches when it opens, when it comes back to the front and every 5 minutes
// (apps/dashboard/src/crm/gympage/pagesOpen.ts), so everything appears together with no reload.
//
// GYM_PAGES = "live": F207 gym web pages are open to visitors (join.mettleup.fit/<gym>, gymPageServe.js). The same
// switch shows the admin app's "Your web page" row and screen, Set up your gym's step, "Asked on your web page" on an
// enquiry, the assistant's "Your web page" page (assistCatalogue.js) and the help article (helpArticles.js).
//
// JOIN_PAY = "live" (R-555, 15 Nov 2026): pay online on the join page (joinPay.js: app.mettleup.fit/m/<CODE> and the gym
// web page's "Become a member"). Held by the owner ("HOLD that deploy for payments until a full payment test sweep
// passes"): while off, every join page says pay at the desk, exactly as before, and the admin app hides the owner's
// "Take payments when people join online" switch, the help article and the Approve line on Today's "Joined online".
// Even when live, visitors are offered a payment company's link only when payments are live (PAY_LIVE "on"): never a
// test-mode payment for the public. A plain UPI ID needs no company, so it is offered either way.
//
// AI_CREDITS_CHARGE = "on" (questionCredits.js; its own value, older than this file): members' AI answers are taken
// from the gym's AI credits. The admin app shows the credits sheet's "AI answers for members" and the question counts
// only while it is on (aiCharge below): with it off nothing is charged, so nothing is shown about charging.

/** Is the switch named `name` on? Only the value "live" is on; an unknown name, no env or any other value is off. */
export function switchOn(env, name) {
  return typeof name === 'string' && Boolean(env) && env[name] === 'live';
}

/** F207: are gym web pages open to visitors? */
export function gymPagesOpen(env) {
  return switchOn(env, 'GYM_PAGES');
}

/** R-555: is pay online on the join page open? (held: off until the owner's payment sweep passes) */
export function joinPayOpen(env) {
  return switchOn(env, 'JOIN_PAY');
}

/** R-555: are AI questions charged on the gym's credits? questionCredits.js reads the same value. */
export function aiChargeOn(env) {
  return Boolean(env) && env.AI_CREDITS_CHARGE === 'on';
}

/** GET /api/switches: what the admin app may show. Never cached for long: switching on shows within minutes. */
export function switchesAnswer(env) {
  return new Response(JSON.stringify({ gymPages: gymPagesOpen(env), joinPay: joinPayOpen(env), aiCharge: aiChargeOn(env) }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
