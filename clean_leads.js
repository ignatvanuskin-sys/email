const fs=require('fs');
const p='src/app/leads/[id]/page.tsx';
let t=fs.readFileSync(p,'utf8');
// Find the opportunity block and remove it
const oppStart=t.indexOf('            <div className="divider" />\n            <div className="section-label">Opportunity</div>');
if(oppStart!==-1){
  const oppEnd=t.indexOf('</select>',oppStart)+9;
  t=t.substring(0,oppStart)+t.substring(oppEnd);
}
const dividerStart=t.indexOf('            <div className="divider" />',oppStart===-1?0:oppStart-100);
// remove broken sibling lines from the leftover tags removal
const lines=t.split('\n');
const out=[];
for(let i=0;i<lines.length;i++){
  const l=lines[i];
  if(l.includes('data.opportunity')||l.includes('stageColor')||l.includes('updateOpportunity')||l.includes('addTag')||l.includes('removeTag')) continue;
  out.push(l);
}
fs.writeFileSync(p,out.join('\n'));
console.log('clean ok');
