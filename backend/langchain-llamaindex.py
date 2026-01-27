from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from dotenv import load_dotenv
from dataclasses import dataclass
from langchain.tools import tool, ToolRuntime
from langchain.chat_models import init_chat_model
from langchain.agents.structured_output import ToolStrategy
from langgraph.checkpoint.memory import InMemorySaver
from langchain.agents import create_agent
from dotenv import load_dotenv
from langchain_community.utilities import GoogleSerperAPIWrapper

load_dotenv()

checkpointer = InMemorySaver()

search = GoogleSerperAPIWrapper()

# --- LLAMAINDEX SETUP (From llamaindex-example.py) ---
# We initialize this globally so the index is built once when the script starts,
# rather than rebuilding it every time the tool is called.
try:
    # 1. Load data
    documents = SimpleDirectoryReader("data").load_data()

    # 2. Build Index
    index = VectorStoreIndex.from_documents(documents)

    # 3. Create Retriever (INSTEAD of Query Engine)
    # similarity_top_k determines how many text chunks to retrieve
    retriever = index.as_retriever(similarity_top_k=3) 

except Exception as e:
    print(f"Warning: Could not load LlamaIndex documents. Error: {e}")
    retriever = None

SYSTEM_PROMPT = """You are a document assistant. You answer user questions about some chosen documents. However, if the documents cannot help you answer the question, you search the internet for information that can help you answer the question.

You have access to two tools:

- search_documents: use this to retrieve documents relevant to the user's question
- search_internet: use this to search the internet for information relevant to the user's question

Again, search the documents first. Only if the documents cannot help you answer the question, search the internet."""

@tool
def search_documents(query: str) -> str:
    """
    Retrieve the top 3 nodes from the index based on the query. Format the node contents and return as a string.
    """
    if not retriever:
        return "Error: Document index is not initialized."
    
    # This retrieves 'NodeWithScore' objects (raw text + relevance score)
    nodes = retriever.retrieve(query)
    
    if not nodes:
        return "No relevant documents found."

    # Format the output so the Agent can read it easily
    # We join the text of the retrieved nodes
    response_text = "\n\n".join(
        [f"--- Document Snippet {i+1} ---\n{node.node.get_content()}" for i, node in enumerate(nodes)]
    )
    
    return response_text

@tool
def search_internet(query: str) -> str:
    """Returns search results from the internet given a query."""
    return search.run(query)

model = init_chat_model(
    "openai:gpt-4o",
    temperature=0.5,
    timeout=10,
    max_tokens=1000
)

@dataclass
class ResponseFormat:
    """Response schema for the agent."""
    # whether the agent used the search_internet tool
    did_search_internet: bool
    # final answer to the user's question
    final_answer: str


agent = create_agent(
    model=model,
    system_prompt=SYSTEM_PROMPT,
    tools=[search_documents, search_internet],
    # context_schema=Context,
    response_format=ToolStrategy(ResponseFormat),
    checkpointer=checkpointer
)

# `thread_id` is a unique identifier for a given conversation.
config = {"configurable": {"thread_id": "1"}}

response = agent.invoke(
    {"messages": [{"role": "user", "content": "Is Obama's presidency controversial? Why or why not?"}]},
    config=config,
    # context=Context(user_id="1")
)

print(response['structured_response'])

print("\n" + "="*30)
print("DEBUG: ACTUAL RAW TOOL OUTPUTS")
print("="*30)

# Iterate through the message history to find ToolMessages
for msg in response["messages"]:
    if msg.type == "tool":
        print(f"--- Tool: {msg.name} ---")
        print(msg.content)
        print("\n")