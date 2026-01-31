import json
import os

filepath = r'C:\Users\skdso\.antigravity\extensions\extensions.json'

with open(filepath, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Check if it already exists
if not any(item.get('identifier', {}).get('id') == 'skdsam.project-tracker' for item in data):
    new_entry = {
        "identifier": {
            "id": "skdsam.project-tracker"
        },
        "version": "1.0.0",
        "location": {
            "$mid": 1,
            "path": "/c:/Users/skdso/.antigravity/extensions/skdsam.project-tracker-1.0.0",
            "scheme": "file"
        },
        "relativeLocation": "skdsam.project-tracker-1.0.0",
        "metadata": {
            "installedTimestamp": 1769198546509,
            "pinned": True,
            "source": "manual"
        }
    }
    data.append(new_entry)
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f)
    print("Extension added to extensions.json")
else:
    print("Extension already in extensions.json")
