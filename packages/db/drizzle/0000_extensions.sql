-- Extensions used across the schema: vector similarity (pgvector) and fuzzy search (pg_trgm).
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm;
