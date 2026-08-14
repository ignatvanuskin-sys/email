const fs=require('fs');
const p='src/app/leads/[id]/page.tsx';
let t=fs.readFileSync(p,'utf8');
// find broken section around line 134-150
const start=t.indexOf('            <div className="row">');
const end=t.indexOf('            <div className="divider" />',start);
const broken=t.substring(start,end);
const replacement='            <div className="row">\n              <button className="btn btn-primary" onClick={analyze} disabled={!!busy}>\n                {busy === "analyzing" ? <><span className="spinner" /> Analyzing…</> : "Analyze"}\n              </button>\n              <select className="select" style={{ maxWidth: 170 }} value="" onChange={(e) => e.target.value && setStatus(e.target.value)}>\n                <option value="" disabled>Set status…</option>\n                <option value="Client">Client</option>\n                <option value="Lost">Lost</option>\n                <option value="Not Now">Not Now</option>\n                <option value="Unsubscribed">Unsubscribed</option>\n              </select>\n            </div>';
const newT=t.substring(0,start)+replacement+t.substring(end);
fs.writeFileSync(p,newT);
console.log('ok');
