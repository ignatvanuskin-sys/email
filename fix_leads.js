const fs = require('fs');
const p = 'src/app/leads/[id]/page.tsx';
let t = fs.readFileSync(p, 'utf8');

// Remove tags/opportunity from Profile type
const profileStart = t.indexOf('type Profile = {');
const profileEnd = t.indexOf('};', profileStart) + 2;
const profileBlock = t.slice(profileStart, profileEnd);
const cleanProfile = profileBlock
  .replace(/\s*tags: Array\{[^}]+\};?/g, '')
  .replace(/\s*opportunity: \{[^}]+\}[^;]+;?/g, '');
t = t.slice(0, profileStart) + cleanProfile + t.slice(profileEnd);

// Remove helper functions and V1 JSX sections
t = t.replace(/\s*const addTag = async[\s\S]*?^\};$/m, '');
t = t.replace(/\s*const removeTag = async[\s\S]*?^\};$/m, '');
t = t.replace(/\s*const updateOpportunity = async[\s\S]*?^\};$/m, '');
t = t.replace(/\s*function stageColor\([\s\S]*?^\}$/m, '');
t = t.replace(/\s*function AddTag\([\s\S]*?^\}$/m, '');

// Remove Tags and Opportunity JSX sections
const tagsStart = t.indexOf('            <div className="divider" />', t.indexOf('Tags'));
const tagsEnd = t.indexOf('            <div className="row">', tagsStart);
if (tagsStart !== -1) t = t.slice(0, tagsStart) + t.slice(tagsEnd);

const oppStart = t.indexOf('            <div className="divider" />', t.indexOf('Opportunity'));
const oppEnd = t.indexOf('            <div className="row">', oppStart);
if (oppStart !== -1) t = t.slice(0, oppStart) + t.slice(oppEnd);

// Remove addTag/removeTag/updateOpportunity from destructuring if present
// (none in this case since they are inside LeadProfilePage)

fs.writeFileSync(p, t);
console.log('fixed');
