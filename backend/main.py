from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from contextlib import asynccontextmanager
import os
import tempfile
import requests
from dotenv import load_dotenv

from llama_index.core import SimpleDirectoryReader, VectorStoreIndex, StorageContext
from llama_index.core.vector_stores import MetadataFilters, ExactMatchFilter

from langchain.tools import tool
from langchain.chat_models import init_chat_model
from langchain.agents.structured_output import ToolStrategy
# NEW IMPORTS FOR PERSISTENCE
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

from langchain.agents import create_agent
from langchain_community.utilities import GoogleSerperAPIWrapper
from dataclasses import dataclass

from rag_utils import get_vector_store, delete_file_by_id

load_dotenv()
search = GoogleSerperAPIWrapper()

# --- LIFESPAN MANAGER (The Database Keeper) ---
# This replaces the global "checkpointer = InMemorySaver()"
# It ensures the database connection opens when the server starts 
# and closes when the server stops.
@asynccontextmanager
async def lifespan(app: FastAPI):
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise ValueError("DATABASE_URL not set")
    
    # --- FIX IS HERE: Add kwargs={"autocommit": True} ---
    # This ensures that when setup() runs "CREATE INDEX CONCURRENTLY", 
    # it is not wrapped in a transaction block.
    async with AsyncConnectionPool(
        conninfo=db_url, 
        max_size=20, 
        kwargs={"autocommit": True} 
    ) as pool:
        checkpointer = AsyncPostgresSaver(pool)
        
        # This will now succeed
        await checkpointer.setup()
        
        app.state.checkpointer = checkpointer
        yield

# Initialize FastAPI with the lifespan
app = FastAPI(lifespan=lifespan)
# set up cors to allow frontend to access backend
app.add_middleware(
    CORSMiddleware,
    # In production, replace ["*"] with your actual Vercel domain
    allow_origins=["http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"], # Allows GET, POST, DELETE, etc.
    allow_headers=["*"],
)

# --- Agent & Tool Setup Helpers ---
@dataclass
class ResponseFormat:
    did_search_internet: bool
    final_answer: str

def create_rag_agent(conversation_id: str, checkpointer):
    """
    Creates the agent using the PERSISTENT checkpointer passed from the request.
    """
    
    # 1. Setup Retriever (Same as before)
    vector_store = get_vector_store()
    index = VectorStoreIndex.from_vector_store(vector_store=vector_store)
    filters = MetadataFilters(
        filters=[ExactMatchFilter(key="conversation_id", value=conversation_id)]
    )
    retriever = index.as_retriever(similarity_top_k=3, filters=filters)

    # 2. Define Tools (Same as before)
    @tool
    def search_documents(query: str) -> str:
        """Retrieve the top 3 nodes from the index based on the query."""
        nodes = retriever.retrieve(query)
        if not nodes:
            return "No relevant documents found."
        return "\n\n".join([f"--- Document Snippet {i+1} ---\n{node.node.get_content()}" for i, node in enumerate(nodes)])

    @tool
    def search_internet(query: str) -> str:
        """Returns search results from the internet."""
        return search.run(query)

    # 3. Create Agent
    SYSTEM_PROMPT = """You are a document assistant. Answer user questions based on the retrieved documents first.
    Only search the internet if the documents are insufficient."""

    model = init_chat_model("openai:gpt-4o", temperature=0.5)

    agent = create_agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
        tools=[search_documents, search_internet],
        response_format=ToolStrategy(ResponseFormat),
        checkpointer=checkpointer # <--- NOW USING POSTGRES SAVER
    )
    
    return agent


# --- Endpoint Param Models ---

class IndexFileRequest(BaseModel):
    file_url: str
    file_id: str
    conversation_id: str

class ChatRequest(BaseModel):
    message: str
    conversation_id: str

class DeleteFileRequest(BaseModel):
    file_id: str
    conversation_id: str


# --- Endpoints ---

@app.get("/")
def read_root():
    return {"message": "PaperParrot Backend is running"}

@app.post("/api/index-file")
def index_file(request: IndexFileRequest):
    try:
        # Same logic as before...
        print(f"Downloading {request.file_url}...")
        response = requests.get(request.file_url)
        response.raise_for_status()
        
        ext = os.path.splitext(request.file_url)[1] or ".txt"
        
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(response.content)
            tmp_path = tmp.name

        try:
            documents = SimpleDirectoryReader(input_files=[tmp_path]).load_data()
            for doc in documents:
                doc.metadata["conversation_id"] = request.conversation_id
                doc.metadata["file_id"] = request.file_id
            
            vector_store = get_vector_store()
            storage_context = StorageContext.from_defaults(vector_store=vector_store)
            VectorStoreIndex.from_documents(documents, storage_context=storage_context)
            
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
                
        return {"status": "success", "message": f"Indexed file {request.file_id}"}

    except Exception as e:
        print(f"Error indexing file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/delete-file")
def delete_file(request: DeleteFileRequest):
    try:
        delete_file_by_id(request.file_id)
        return {"status": "success", "message": f"Deleted file {request.file_id}"}
    except Exception as e:
        print(f"Error deleting file: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat(request: ChatRequest):
    try:
        # 1. Retrieve the checkpointer from app.state
        checkpointer = app.state.checkpointer
        
        # 2. Pass it to the agent creator
        agent = create_rag_agent(request.conversation_id, checkpointer)
        
        # 3. Thread ID is CRITICAL for persistence
        config = {"configurable": {"thread_id": request.conversation_id}}
        
        # 4. Await the invoke (since AsyncPostgresSaver is async)
        # Note: LangGraph's invoke can be sync or async. 
        # Since we use AsyncPostgresSaver, we should use `ainvoke` (async invoke).
        response = await agent.ainvoke(
            {"messages": [{"role": "user", "content": request.message}]},
            config=config,
        )
        
        structured_res = response.get('structured_response')
        if structured_res:
            return {
                "answer": structured_res.final_answer,
                "sources": "internet" if structured_res.did_search_internet else "documents" 
            }
        
        return {"answer": "Error: Could not generate a structured response."}

    except Exception as e:
        print(f"Error in chat: {e}")
        # In production, check logs to see if it's a DB connection error
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/{conversation_id}/history")
async def get_chat_history(conversation_id: str):
    try:
        # 1. Get the checkpointer directly
        checkpointer = app.state.checkpointer
        config = {"configurable": {"thread_id": conversation_id}}
        
        # 2. Fetch the raw checkpoint from the database
        # We DO NOT need to create the agent or vector store here.
        # This bypasses the asyncpg connection entirely.
        checkpoint = await checkpointer.aget(config)
        
        if not checkpoint:
            return {"history": []}
            
        # 3. Extract messages from the checkpoint data
        # 'channel_values' holds the state variables (like "messages")
        messages = checkpoint.get("channel_values", {}).get("messages", [])
        
        history = []
        for msg in messages:
            # 1. Handle User Messages
            if msg.type == "human":
                history.append({
                    "role": "user",
                    "content": msg.content
                })
            
            # 2. Handle AI Messages
            elif msg.type == "ai":
                content_to_show = msg.content
                
                # Extract Structured Output (Hidden content)
                if not content_to_show and hasattr(msg, 'tool_calls') and msg.tool_calls:
                    for tool_call in msg.tool_calls:
                        args = tool_call.get("args", {})
                        if "final_answer" in args:
                            content_to_show = args["final_answer"]
                            break
                
                if content_to_show:
                    history.append({
                        "role": "assistant",
                        "content": content_to_show
                    })
        
        return {"history": history}

    except Exception as e:
        print(f"Error fetching history: {e}")
        return {"history": []}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)