const fs = require('fs');
const path = require('path');

function getProjectMetadata(projectPath) {
    if (!fs.existsSync(projectPath)) return null;

    const metadata = {
        branch: null,
        tech: []
    };

    try {
        // Git Branch Detection
        const gitHeadPath = path.join(projectPath, '.git', 'HEAD');
        if (fs.existsSync(gitHeadPath)) {
            const headContent = fs.readFileSync(gitHeadPath, 'utf8').trim();
            if (headContent.startsWith('ref: refs/heads/')) {
                metadata.branch = headContent.replace('ref: refs/heads/', '');
            } else if (headContent.length === 40) {
                metadata.branch = headContent.substring(0, 7); // Detached HEAD (SHA)
            }
        }

        // Tech Stack Detection
        const files = fs.readdirSync(projectPath);
        if (files.includes('package.json')) metadata.tech.push('Node.js');
        if (files.includes('requirements.txt') || files.includes('Pipfile') || files.some(f => f.endsWith('.py'))) metadata.tech.push('Python');
        if (files.includes('Cargo.toml')) metadata.tech.push('Rust');
        if (files.includes('pom.xml') || files.includes('build.gradle')) metadata.tech.push('Java');
        if (files.includes('CMakeLists.txt')) metadata.tech.push('C++');
        if (files.includes('go.mod')) metadata.tech.push('Go');
        if (files.includes('composer.json')) metadata.tech.push('PHP');
        if (files.includes('Gemfile')) metadata.tech.push('Ruby');

    } catch (e) {
        console.error('Error reading metadata for', projectPath, e);
    }

    return metadata;
}

const currentDir = process.cwd();
console.log('Metadata for:', currentDir);
console.log(JSON.stringify(getProjectMetadata(currentDir), null, 2));