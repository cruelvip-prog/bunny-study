const fs = require('fs');
const p = 'src/components/FeatureScreens.tsx';
let s = fs.readFileSync(p, 'utf8');
const before = s.length;
s = s.replace(/<p className="text-sm font-medium text-slate-700">\s*Remote project:.*?<\/p>\s*/s, '');
s = s.replace(/<p className="mt-1 text-xs text-slate-500">\s*Select a subject below\. Chapters and topics load automatically from the remote database\.\s*<\/p>\s*/s, '');
fs.writeFileSync(p, s);
console.log('changed', before !== s.length, 'before', before, 'after', s.length);