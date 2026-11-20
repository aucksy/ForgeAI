// After _work/lens-items-make.mjs, for every lens other than 3, 4, 5: sets "needs" in each lens-add file and adds the
// improvement row shape to lens 18 briefs. Plain Node, seconds, exits. Run from the repo root:
//   node docs/system-map/_work/lens-post.cjs docs/system-map/_work
// needs: a hunt -> CAL-score; lenses 7, 8, 9, 12, hunts 2, 5, 6 -> M2-machine-pass; 12 -> M3-play-report; 16 -> A8-report; 18 -> L18-gate.
// Prints the step x lenses x needs counts and any brief over 1,200 words.
const fs=require('fs');const W=process.argv[2];const old=new Set(['L3','L4','L5']);const combos={};let maxw=0,over=[];
const IM=(id)=>'{"kind":"improvement","id":"IM-'+id+'-01","expert":"Product designer","surface":"panel","what":"Show the amount due on the member row","why":"Desk staff open every member to see who owes money","evidence":["apps/x/y.tsx:10"],"impact":"high","impact_why":"Used at every rush hour","effort":"S","type":"quick win","my_view":"My view: do it; one line on a list that already loads the number."}\nImprovement (lens 18): one row per idea, id IM-<work item id>-<nn>; impact high | med | low; effort S | M | L; type quick win | feature | redesign | remove; expert = the role you write as. finding_ids in a grid row holds finding ids only (never IM- ids).\n';
for(const f of fs.readdirSync(W+'/lens-add')){ if(!f.endsWith('.json'))continue; const p=W+'/lens-add/'+f; const o=JSON.parse(fs.readFileSync(p,'utf8')); if(old.has(o.step))continue;
 const L=o.lenses; const needs=new Set();
 if(L.some(l=>l.startsWith('gap-')))needs.add('CAL-score');
 if(L.some(l=>['7','8','9','12','gap-2','gap-6','gap-5'].includes(l)))needs.add('M2-machine-pass');
 if(L.includes('12'))needs.add('M3-play-report');
 if(L.includes('16'))needs.add('A8-report');
 if(L.includes('18'))needs.add('L18-gate');
 o.needs=[...needs]; fs.writeFileSync(p,JSON.stringify(o)+'\n');
 const bp=W+'/briefs/'+o.id+'.md'; let t=fs.readFileSync(bp,'utf8');
 if(L.includes('18')&&!t.includes('Improvement (lens 18)')){t=t.replace(/\nFinding: title, what/,'\n'+IM(o.id)+'Finding: title, what');fs.writeFileSync(bp,t)}
 const w=t.split(/\s+/).filter(Boolean).length; maxw=Math.max(maxw,w); if(w>1200)over.push(o.id+':'+w);
 const k=o.step+':'+L.join('+')+' needs '+(o.needs.join(',')||'-'); combos[k]=(combos[k]||0)+1;}
for(const k of Object.keys(combos).sort())console.log(combos[k],k);console.log('max words',maxw,'over',over.join(' '));
