const {
    Server
} = require("@modelcontextprotocol/sdk/server/index.js");
const {
    StdioServerTransport
} = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema
} = require("@modelcontextprotocol/sdk/types.js");
const fs = require('fs');
const path = require('path');

const storagePath = path.join(process.env.USERPROFILE, '.project-tracker', 'tracked_projects.json');

const server = new Server({
    name: "project-tracker",
    version: "1.0.0",
}, {
    capabilities: {
        tools: {},
    },
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [{
                name: "list_recent_projects",
                description: "List the folders that have been used as projects in the IDE recently.",
                inputSchema: {
                    type: "object",
                    properties: {},
                },
            },
            {
                name: "open_project",
                description: "Request the IDE to open a specific project folder.",
                inputSchema: {
                    type: "object",
                    properties: {
                        path: {
                            type: "string",
                            description: "The absolute path of the project folder to open.",
                        },
                    },
                    required: ["path"],
                },
            },
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    switch (request.params.name) {
        case "list_recent_projects": {
            if (!fs.existsSync(storagePath)) {
                return {
                    content: [{
                        type: "text",
                        text: "No projects tracked yet."
                    }]
                };
            }
            const projects = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
            return {
                content: [{
                    type: "text",
                    text: JSON.stringify(projects, null, 2)
                }],
            };
        }
        case "open_project": {
            const projectPath = request.params.arguments.path;
            // In a real MCP server, we might send a message back to the IDE.
            // For now, we'll just return the instruction.
            return {
                content: [{
                    type: "text",
                    text: `I have recorded your request to open ${projectPath}. Please click on it in the Projects sidebar.`
                }],
            };
        }
        default:
            throw new Error("Unknown tool");
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

main().catch(console.error);