# RAG Document Search

A Retrieval-Augmented Generation (RAG) application that lets you ask natural language questions about your documents. It combines vector similarity search with a local LLM to deliver accurate, context-aware answers — all running locally via Ollama.

## How It Works

The application ingests Markdown documents by splitting them into chunks and storing their embeddings in an in-memory vector store (powered by LangChain and Ollama's `embeddinggemma` model). When you submit a question, the system finds the most relevant chunk using cosine similarity, then passes it as context to the `phi3:mini` LLM, which generates a natural language answer. Responses are streamed token-by-token to the browser so you see results immediately rather than waiting for the full generation.

## Features

- **RAG pipeline** — Markdown documents are chunked, embedded, and stored in a vector store for semantic search.
- **Streaming responses** — Ollama streams tokens directly to the UI, so answers appear in real-time.
- **Local & private** — Everything runs on your machine. No data leaves your environment.
- **Simple web UI** — A clean single-page interface for searching your documents.
- **Persistent vector store** — Embeddings are cached to disk after the first ingestion, so subsequent startups are fast.

## Prerequisites

- [Python 3.10+](https://www.python.org/)
- [uv](https://docs.astral.sh/uv/) (Python package manager)
- [Ollama](https://ollama.com/) running locally with the following models pulled:
  ```
  ollama pull phi3:mini
  ollama pull embeddinggemma
  ```

## Setup & Install

1. Clone the repository and navigate to this directory:

    ```bash
      git clone <repo-url>
      cd <repo-directory>

2. Install dependencies:

   ```bash
   uv sync
   ```

3. Place your Markdown documents in the `docs/` folder. A `sample.md` is included to get started.

## Run

Start the API server:

```bash
uv run python api.py
```

Then open your browser to **http://localhost:8002**.

Type a question in the search box (e.g. "Tell me about Task Failure") and the answer will stream in from the LLM, grounded in your document content.

## Project Structure

| File | Description |
|------|-------------|
| `api.py` | FastAPI server — serves the UI and the `/api/search` streaming endpoint |
| `rag.py` | Document ingestion (chunking + embedding) and similarity search |
| `ai.py` | Ollama LLM integration — builds the prompt with RAG context and streams the response |
| `stream.py` | Standalone example of streaming Ollama responses |
| `index.html` | Frontend UI with real-time streaming display |
| `docs/` | Markdown documents to ingest |
