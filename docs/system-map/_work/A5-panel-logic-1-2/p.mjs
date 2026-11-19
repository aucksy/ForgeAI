import fs from 'fs';
const p=JSON.parse(fs.readFileSync('promises.json','utf8'));
const arr=Array.isArray(p)?p:(p.promises||Object.values(p));
console.log(arr.length, Object.keys(arr[0]));
const kws={growth:/your growth|renewal rate|before mettleup|since mettleup/i, came:/came in today|ended plan/i, chal:/challenge|leaderboard/i, code:/workout code|claim code|show my workouts/i, coll:/collections|dues list|money totals|staff cannot see/i, csv:/excel file|csv|formula/i, diet:/diet plan/i, enq:/enquir/i};
for(const [k,re] of Object.entries(kws)){ const hits=arr.filter(r=>re.test(JSON.stringify(r))); console.log('##',k,hits.length); for(const h of hits.slice(0,14)) console.log(h.id,'|',String(h.text||h.promise||h.what||h.title||'').slice(0,170)); }
