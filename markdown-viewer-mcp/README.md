# Markdown Viewer MCP App

An MCP App that ingests markdown files and displays them through four creative, interactive view modes.

## View Modes

| Mode | Description |
|------|-------------|
| 📰 **Magazine** | Card grid with colour-coded banners, excerpts, word counts, and stat badges. Click a card to open it. |
| 📖 **Reader** | Full rendered markdown with a floating table-of-contents sidebar. |
| 🎬 **Slides** | Presentation mode — each H1/H2 section becomes a navigable slide (keyboard arrows supported). |
| 📊 **Dashboard** | Aggregate stats across all loaded documents with bar charts comparing word counts. |

## Quick Start

```bash
# Install dependencies
npm install

# Build and start the server
npm start
```

The server will start on `http://localhost:3004/mcp` by default.

## Usage

Connect the server to your MCP host, then ask:

> "View my markdown files at ./docs/intro.md and ./docs/guide.md"

The `view-markdown` tool accepts an array of file paths and returns an interactive viewer.

### Tool: `view-markdown`

**Input:**
- `filePaths` (string[]) — Paths to markdown files to ingest

**Output:**
- Document count, total word count, and reading time summary
- Interactive UI with all four view modes

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3004` | HTTP server port |

## MCP Server Config

### VS Code / GitHub Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "markdown-viewer-mcp": {
      "type": "http",
      "url": "http://localhost:3004/mcp"
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "markdown-viewer-mcp": {
      "url": "http://localhost:3004/mcp"
    }
  }
}
```

## License

MIT
