import os
from llama_index.vector_stores.postgres import PGVectorStore
from llama_index.core import StorageContext, VectorStoreIndex
from sqlalchemy import text, create_engine
from dotenv import load_dotenv

load_dotenv()

def get_vector_store():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL not set")

    # Use the constructor directly, passing the connection string
    vector_store = PGVectorStore(
        connection_string=db_url,
        async_connection_string=db_url.replace("postgresql://", "postgresql+asyncpg://"),
        table_name="paperparrot_embeddings",
        embed_dim=1536,
        cache_ok=True # Optimization for frequent queries
    )
    return vector_store

def delete_file_by_id(file_id: str):
    """
    Deletes all nodes associated with a specific file_id directly via SQL.
    """
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL not set")

    # 1. Create a fresh, temporary engine just for this deletion
    # This is safer than trying to steal the engine from LlamaIndex
    engine = create_engine(db_url)

    # 2. Connect and Delete
    with engine.begin() as conn:
        # NOTICE THE TABLE NAME CHANGE: "data_paperparrot_embeddings"
        # LlamaIndex adds the "data_" prefix automatically.
        stmt = text("DELETE FROM data_paperparrot_embeddings WHERE metadata_->>'file_id' = :fid")
        conn.execute(stmt, {"fid": file_id})
        
    # Engine automatically closes here

def delete_conversation_by_id(conversation_id: str):
    """
    Deletes all embeddings associated with a specific conversation_id.
    """
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL not set")

    engine = create_engine(db_url)

    with engine.begin() as conn:
        stmt = text("DELETE FROM data_paperparrot_embeddings WHERE metadata_->>'conversation_id' = :cid")
        conn.execute(stmt, {"cid": conversation_id})

        # --- Delete LangGraph Checkpoints ---
        # The 'thread_id' in these tables corresponds to our 'conversation_id'
        
        # 1. checkpoints
        stmt_checkpoints = text("DELETE FROM checkpoints WHERE thread_id = :cid")
        conn.execute(stmt_checkpoints, {"cid": conversation_id})

        # 2. checkpoint_blobs
        stmt_blobs = text("DELETE FROM checkpoint_blobs WHERE thread_id = :cid")
        conn.execute(stmt_blobs, {"cid": conversation_id})

        # 3. checkpoint_writes
        stmt_writes = text("DELETE FROM checkpoint_writes WHERE thread_id = :cid")
        conn.execute(stmt_writes, {"cid": conversation_id})

def get_storage_context(vector_store):
    return StorageContext.from_defaults(vector_store=vector_store)

def get_index(vector_store):
    return VectorStoreIndex.from_vector_store(vector_store=vector_store)
