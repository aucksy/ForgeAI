import fs from 'fs';
const f=JSON.parse(fs.readFileSync('features.json','utf8'));
const arr=Array.isArray(f)?f:(f.features||Object.values(f));
const ids=['F-panel-614','F-panel-616','F-panel-617','F-panel-618','F-panel-619','F-panel-620','F-panel-622','F-panel-623'];
for(const r of arr) if(ids.includes(r.id)) console.log(JSON.stringify(r));
const e=JSON.parse(fs.readFileSync('entities.json','utf8'));
const ea=Array.isArray(e)?e:(e.entities||Object.values(e));
console.log(Object.keys(ea[0]));
for(const r of ea) console.log(r.id, '|', r.name||'', '|', (r.table||r.tables||r.store||''));
