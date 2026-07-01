-- Runs once on first container init. Enables pgvector for embedding storage/search.
CREATE EXTENSION IF NOT EXISTS vector;
