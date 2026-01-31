# Project Tracker

Project Tracker is a powerful extension designed to streamline your workspace management. It automatically tracks the project folders you use, provides a quick-access list in the Activity Bar, and offers handy tools to manage your project history with a focus on speed and visual clarity.

## 🚀 Features

- **📂 Automatic Project Tracking**: Never lose track of where you've been. The extension automatically maintains a history of folders used as projects.
- **📌 Pinned Projects**: Keep your most important work at the top. Mark projects as pinned for instant access regardless of how recently they were opened.
- **🌿 Deep Git Integration**: 
  - Real-time branch detection.
  - **Dirty State** indicators (unsaved changes marked with `*`).
  - **Change Badges**: See exactly how many files are modified (e.g., `[3]`) without opening the project.
  - **☁️ GitHub Sync**:
    - **Remote Status Detection**: Automatically shows if you are behind the GitHub remote with a badge.
    - **🔴 Red Sync Badge**: A native red `↓` badge appears on the right side of the project entry when updates are available, making it instantly recognizable.
    - **One-Click Pull**: Sync your projects instantly with the "Pull" button.
- **🌍 External Repository Discovery**:
  - **GitHub Inventory**: Browse your GitHub repositories (public and private) directly from the sidebar.
  - **Instant Clone**: Clone and add remote repositories to your tracker with a single click.
- **🎨 Visual Customization**: 
  - **Custom Icons**: Assign unique icons to distinguish between project types.
  - **Color Themes**: Use color-coded icons (Blue, Red, Green, etc.) for better visual organization.
- **✨ Smart Tech Detection**: Automatically detects and displays the primary technology stack (Node.js, Python, Rust, Go, PHP, etc.).
- **📁 Interactive Breakdown**: Expand project entries to see key files (README, package.json, etc.) and jump directly into them with a single click.
- **🏠 Dedicated Sidebar**: A clean, focused view in the Activity Bar keeps your project history separate from the file explorer.
- **⚠️ Smart Status Detection**: Visual alerts (red error icons) immediately inform you if a project folder has been moved or deleted.
- **🗑️ Safe Management**: Easily remove project entries with a confirmation dialog to keep your list tidy.
- **📈 Git Activity Sparklines**: See your development momentum at a glance with 7-day commit activity graphs (e.g., ` ▂▃▅▆▇`) built directly into project descriptions.
- **👥 Top Contributors**: Discover the most active authors in any project. Expand a project to see a dedicated "Top Contributors" view.
- **🤖 MCP Ready**: Built-in MCP server integration for advanced project discovery and external tool support. (Use via the `project-tracker` server).

## 🛠️ Usage

1. **Access the Tracker**: Look for the folder icon in your Activity Bar.
2. **Open Projects**: Simply click a project name to open it in a new window.
3. **Quick Search**: Use the search icon (🔍) in the view title to filter your projects by name or path.
4. **Context Menu**: Right-click any project to:
   - **Pin/Unpin** it.
   - **Set Custom Icon**.
   - **Set Custom Color**.
   - **Remove** it from the list.

## ⌨️ Available Commands

| Command | Title | Description |
|---------|-------|-------------|
| `project-tracker.searchProjects` | **Search Recent Projects** | Filter and open projects from your history. |
| `project-tracker.addProjectFolder` | **Add Folder to Projects** | Manually add a folder to the tracker. |
| `project-tracker.refreshList` | **Refresh** | Manually refresh the project list status. |
| `project-tracker.setProjectIcon` | **Set Project Icon** | Choose a custom icon for the project. |
| `project-tracker.setProjectColor` | **Set Project Color** | Choose a custom theme color for the icon. |
| `project-tracker.pullProject` | **Pull Updates** | Pull changes from the GitHub remote. |
| `project-tracker.signInGitHub` | **Sign in to GitHub** | Authenticate with GitHub to enable sync and discovery features. |

## 🤝 MCP Server Integration

This extension includes a built-in MCP (Model Context Protocol) server, allowing AI agents and other tools to:
- **List Recent Projects**: Programmatically access your project history.
- **Open Projects**: Request the IDE to open specific project folders.
- **Track Activity**: Automatically update project metadata via external requests.

To use the MCP server, point your MCP client to the `mcp-server.js` file in the extension directory.


## Technical Details

- **Extension ID**: `skdsam.project-tracker`
- **Supported Tech Stacks**: Node.js, Python, Rust, Go, PHP, Web (HTML/CSS/JS).
- **Metadata Detection**: Automatically reads `.git/HEAD` for branch info and scans for project markers like `package.json`, `requirements.txt`, etc.

---
Built by SkdSam for a better developer experience.
