const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/skdso/.antigravity/extensions/extensions.json', 'utf8'));
const entry = data.find(e => e.identifier.id === 'skdsam.project-tracker');
console.log(JSON.stringify(entry, null, 2));