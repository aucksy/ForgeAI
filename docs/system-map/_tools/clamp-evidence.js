// clamp out-of-file evidence line ranges: node clamp.js <id>
const fs=require('fs'),path=require('path');
const root='C:/Users/Aakash Pahuja/AppData/Local/Temp/claude/19050ed31f641eaa/a75edd9f-3244-414f-b133-ce887d21fe49/scratchpad/wt-audit';
const p=root+'/docs/system-map/_work/out/'+process.argv[2]+'.jsonl';
let t=fs.readFileSync(p,'utf8');const n={};
t=t.replace(/"([A-Za-z0-9_.\/\-]+\.[a-z]+):(\d+)(?:-(\d+))?"/g,(m,f,a,b)=>{const fp=path.join(root,f);if(!fs.existsSync(fp))return m;
 const L=(n[f]??=fs.readFileSync(fp,'utf8').split('\n').length-(fs.readFileSync(fp,'utf8').endsWith('\n')?1:0));
 if(+a<=L&&(!b||+b<=L))return m;const s=Math.min(+a,L);console.log('clamped',f,a,b,'->',s,L);return `"${f}:${s}${b||+a>L?'-'+L:''}"`.replace(`:${L}-${L}`,`:${L}`);});
fs.writeFileSync(p,t);
