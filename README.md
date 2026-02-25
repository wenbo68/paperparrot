# paperparrot

## What is it?
- user can log in
- for each conversation, user uploads files (pdf/txt/etc)
- each conversation only looks at its own files (no uploaded files span across conversations)
- when user uploads files, frontend stores them in uploadthing, updates neon with the file metadata and url, and gives url to backend, which uses the url to fetch the files and index them to neon pgvector using llamaindex
- when user deletes files, frontend deletes them from uploadthing, updates neon metadata, and tells the backend to delete the file from neon pgvector
- user can ask questions -> llamaindex retrieves files -> langchain decides if retrieved files are good enough -> if yes, answer; if not, search internet and answer

## Stack
- agent orchestration: langchain
- rag (indexing/retrieval): llamaindex
- embedding model: llamaindex default (openai: text-embedding-3-small)
- inference model: langchain init_chat_model
- storage: uploadthing (files/blob), neon postgres (file metadata, app data, checkpointer), neon pg vector (vector db)
- frontend: t3 stack, trpc (for handling frontend stuff like app/user logic), tanstack query (for communicating with python backend), drizzle, nextauth, deployed on vercel
- backend: python/fastapi, deployed on railway or render
- cdn: uploadthing

# Future features
- automatically delete empty conversations

# Todo

