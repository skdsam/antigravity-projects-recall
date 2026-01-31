const fs = require('fs');
const path = require('path');

const files = ['package.json', 'extension.js', 'README.md'];

files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
        let content = fs.readFileSync(filePath, 'utf8');

        // Replace command prefix
        content = content.replace(/antigravity-project-tracker/g, 'project-tracker');

        // Replace view/container prefix
        content = content.replace(/antigravity-projects/g, 'project-tracker-sidebar');

        fs.writeFileSync(filePath, content);
        console.log(`Updated ${file}`);
    } else {
        console.log(`Skipped ${file} (not found)`);
    }
});