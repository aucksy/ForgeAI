// QA helper (runScript), 0048: the front desk says "Yes, it's theirs" to the number the phone just
// typed at the poster check-in, the way the admin app's "Numbers to confirm" card does
// (owner_phone_links, then owner_decide_phone_link 'approved' for each pending one).
// Env (runScript env:): DESK_URL (the server), DESK_APIKEY (the publishable key the app ships with),
// DESK_KEY (the test gym owner's session key, from run-device-qa.sh), DESK_PHONE (optional:
// "+919876500002", only that number is approved). Kept in a file: inside ${...} the first } ends it.
// The key is never printed.
var base = String(DESK_URL).replace(/\/+$/, '');
var apikey = String(DESK_APIKEY);
var ownerKey = String(DESK_KEY);
var only = typeof DESK_PHONE === 'undefined' ? '' : String(DESK_PHONE || '');
if (base.indexOf('http') !== 0 || !apikey || apikey === 'undefined' || !ownerKey || ownerKey === 'undefined' || ownerKey.indexOf('$') === 0) {
  throw new Error('desk-approve: DESK_URL / DESK_APIKEY / DESK_KEY were not passed in');
}

function rpc(name, body) {
  var r = http.post(base + '/rest/v1/rpc/' + name, {
    headers: { apikey: apikey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status < 200 || r.status >= 300) {
    throw new Error('desk-approve: ' + name + ' answered ' + r.status + ': ' + String(r.body).substring(0, 200));
  }
  return r.body ? JSON.parse(r.body) : null;
}

var rows = rpc('owner_phone_links', { p_key: ownerKey }) || [];
var approved = 0;
for (var i = 0; i < rows.length; i++) {
  var q = rows[i];
  if (q.status !== 'pending') continue;
  if (only && q.phone !== only) continue;
  rpc('owner_decide_phone_link', { p_key: ownerKey, p_link: q.id, p_decision: 'approved' });
  approved++;
  console.log('desk-approve: approved ' + q.phone + ' for ' + q.memberName);
}
if (approved === 0) throw new Error('desk-approve: the phone was asked to see the desk, but no number was waiting (' + rows.length + ' rows)');
output.deskApproved = approved;
