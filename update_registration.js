const fs = require('fs');
const path = require('path');

const extensionsJsonPath = 'C:\\Users\\skdso\\.antigravity\\extensions\\extensions.json';
const extensionId = 'skdsam.project-tracker';
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const extensionVersion = packageJson.version;
const extensionDirName = `${extensionId}-${extensionVersion}`;

try {
    const data = JSON.parse(fs.readFileSync(extensionsJsonPath, 'utf8'));

    // Remove existing
    const filteredData = data.filter(item => item.identifier && item.identifier.id !== extensionId);

    const newEntry = {
        "identifier": {
            "id": extensionId
        },
        "version": extensionVersion,
        "location": {
            "$mid": 1,
            "path": `/c:/Users/skdso/.antigravity/extensions/${extensionDirName}`,
            "scheme": "file"
        },
        "relativeLocation": extensionDirName,
        "metadata": {
            "installedTimestamp": Date.now(),
            "source": "manual"
        }
    };

    filteredData.push(newEntry);

    fs.writeFileSync(extensionsJsonPath, JSON.stringify(filteredData, null, 4), 'utf8');
    console.log("Successfully updated extensions.json with simplified metadata.");
} catch (err) {
    console.error("Error updating extensions.json:", err);
}