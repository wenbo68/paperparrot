from llama_index.core import VectorStoreIndex, SimpleDirectoryReader
from dotenv import load_dotenv

# This is the "magic" line that loads your .env file into the environment
load_dotenv()

# scan files in ./data -> choose parser based on file type -> parse them into Document objects
documents = SimpleDirectoryReader("data").load_data()

# chunk the documents to nodes -> convert nodes to embeddings -> 
# put all nodes in 1 unnamed collection in a temp vector db living in memory ->
# create index for that collection
index = VectorStoreIndex.from_documents(documents)

# adds an inference model on top of the index
query_engine = index.as_query_engine()

response = query_engine.query("Why is the sky blue?")

print(response)