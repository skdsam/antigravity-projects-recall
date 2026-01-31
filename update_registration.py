import json
import os

extensions_json_path = r'C:\Users\skdso\.antigravity\extensions\extensions.json'
extension_id = 'skdsam.project-tracker'
extension_version = '1.0.0'
extension_dir_name = f'{extension_id}-{extension_version}'
extension_path_full = rf'c:\Users\skdso\.antigravity\extensions\{extension_dir_name}'

with open(extensions_json_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Find if it exists and remove it to re-add with full metadata
data = [item for item in data if item.get('identifier', {}).get('id') != extension_id]

new_entry = {
    "identifier": {
        "id": extension_id
    },
    "version": extension_version,
    "location": {
        "$mid": 1,
        "fsPath": extension_path_full,
        "_sep": 1,
        "external": f"file:///c%3A/Users/skdso/.antigravity/extensions/{extension_dir_name}",
        "path": f"/c:/Users/skdso/.antigravity/extensions/{extension_dir_name}",
        "scheme": "file"
    },
    "relativeLocation": extension_dir_name,
    "metadata": {
        "installedTimestamp": 1769198546509,
        "pinned": True,
        "source": "manual"
    }
}

data.append(new_entry)

with open(extensions_json_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4)

print("Successfully updated extensions.json with full metadata.")
