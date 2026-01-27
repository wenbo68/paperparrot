# paperparrot

### What is it?

- user can log in
- for each conversation, user uploads files (pdf/txt/etc)
- user can ask questions -> llamaindex retrieves files -> langchain decides if retrieved files are good enough -> if yes, answer; if not, search internet and answer

### Stack

##### stage 1

- agent orchestration: langchain
- rag (indexing/retrieval): llamaindex
- storage: uploadthing (files/blob), neon postgres (file metadata, app data, checkpointer), neon pg vector (vector db)
- embedding model: llamaindex default (openai: text-embedding-3-small)
- inference model: langchain init_chat_model
- frontend: nextjs (deployed on vercel)
- backend: python/fastapi (deployed on railway or render)

### Steps

# Reminders

### architecture

##### compute (app server) infrastructure: stateless (each request is separate; nothing will span across requests)

1. on-premise: physical server (anything that's not on-premise is cloud)

2. IaaS: infrastructure as a service (aka vps)

- pros: you do whatever you want; you have root access; you can ssh in
- cons: you set up and maintain the os/security/scaling
- example: aws ec2, contabo

3. PaaS: platform as a service (no cool nickname... maybe platform?)

- pros: you just give the provider your code; they manage the os/security/scaling for you (opinionated)
- cons: more expensive; less control than iaas (you don't have root access and usually cannot ssh in)
- example: railway, render

4. Caas: containers as a service (industry standard for AI)

- provider runs your kubernetes cluster (keeps it alive)
- you give provider detailed yaml files that dictate how many cpu/gpu each service can use and which other services it can talk to
- so caas is unopinionated unlike paas: you (not the provider) determine how it runs
- example: aws eks, google kubernetes engine (gke)

5. FaaS: function as a service (aka serverless)

- pros: scales down to 0 (you pay 0 when no one is using); scales infinitely
- cons: cold start; not good for something that needs to stay open all the time (eg db connection, websocket); database should be serverless too
- example: aws lambda, vercel functions, cloudflare workers
- how?
  1. a user calls an api route (if you deployed on serverless, each api route is a serverless function)
  2. if there's a frozen micro-container for that api route (aka serverless function), the provider thaws it (<10ms) and reuses it
  3. if there's no frozen containers for that api route, the provider spins up a container (<0.5s) and uses it
  4. after the api returns a http response to user, the container is frozen for 5-15 min (depends on provider) and then killed

6. Edge faas

- cdn nodes (cloudflare has 330+) are more widespread than server warehouses (aws has 35)
- traditionally, cdn nodes cannot do compute (only store files)
- but vercel & cloudflare put tiny cpus (128MB RAM) in all their cdn nodes, so now their cdn nodes can do compute
- you upload code to the provider server -> a copy of your code (1-5MB) is stored in each cdn node
- certain user requests will go directly to the closest cdn node for much faster responses
- example: vercel edge (only middleware code uses edge by default; other codes won't use edge unless specified)

##### storage (db server) infrastructure: stateful (some info will span across requests, eg session info)

1. on premise
2. iaas
3. paas

- example: aws rds, railway postgres

4. caas

- if you have a caas app, you can store your db in the same caas/cluster
- but need to download Operator software to manage your db within the cluster
- operator example: CloudNativePG (gold standard), StackGres, ChromaDB Helm Chart (use when chromdb + caas)

5. "serverless" paas

- specialized paas that handles serverless apps (so that sudden high traffic from serverless app doesn't block your db connections and make it very slow)
- the providers scale the db server down to 0 (freeze it when no traffic for some time)
- and up infinitely (but each provider implements differently)
- example: aws aurora serverless, neon, upstash, pinecone

##### cache

1. cdn

- servers (ie cdn nodes) spread across the world
- no compute: don't run code
- just stores your static files, images, videos, etc.
- user requests them from closest cdn node via urls

### scaling: when and how

##### app server scaling

- you scale when your app server doesn't have enough RAM/CPU
- make sure you delete old logs & docker images so you don't have to worry abt disk space
- horizontal scaling is the standard for app servers
- need to manage each app server's db connection pool when you scale your app server
  - app server scaled vertically: increase max connections (eg 20 -> 200) of that 1 pool
  - app server scaled horizontally: each app server has 1 pool (eg each app server has 20 db connections)

1. on premise

- vertical: power off server -> open case -> insert more ram sticks or better cpu-> power back on
- horizontal: set up another server -> update your physical/software load balancer to include the new ip addr

2. iaas

- vertical: stop the instance -> change instance type to better one -> start the instance
- horizontal: spin up another vps -> update your load balancer

3. paas

- vertical: go to settings -> change plan
- horizontal: go to settings -> drag the instance count slider from 1 to 5

4. caas

- vertical: edit yaml config (resources.requests.memory: "4Gi") -> apply -> kubernetes will restart
- horizontal: run cmd "kubectl scale deployment my-app --replicas=5" OR configure HPA to run cmd automatically based on RAM/CPU%

5. faas/edge

- vertical: go to settings -> change memory size or cpu
- horizontal: do nothing... serverless automatically means infinite horizontal scaling

##### db server scaling

- you scale for RAM/CPU and for disk space and disk speed (larger disks are faster in cloud)
- writes are often scaled vertically
  - too many people writing to db -> switch to db server with more ram
  - horizontal write scaling (sharding) is extremely complicated
- reads are often scaled horizontally via the master-slave architecture (aka read replicas, primary-replica, lead-follower, etc.)
  -too many people reading the db -> add more db servers that can only be read and will constantly copy data from the master (master can be written and also read when needed)

1. on premise

- vertical (writes): get better server -> pg_dump in old server -> restore data to new server
- horizontal (reads): complicated...

2. iaas

- vertical: stop vps -> resize -> start vps
- horizontal: complicated...

3. paas

- vertical: change plan
- horizontal: click add new read replica -> get a read_replica_url -> change app code to send writes to database_url (master) and reads to read_replica_url (replica)
- some paas (eg planetscale, cockroachdb, etc) will scale and route for you automatically, ie you just use 1 url all the time

4. caas

- vertical: edit yaml config (increase StatefulSet limits)
- horizontal: use a Kubernetes Operator (eg CloudNativePG) -> request operator for more db instances -> handles master-slave automatically

5. "serverless" paas: auto-scaling

### regarding ai stack/deployment

##### stateless (app logic)

1. frontend code

- stack: uses react; python can only create generic UI via streamlit/gradio
- deployment: faas (eg vercel)

2. backend code

- stack: uses python; langchain typescript is usable but llamaindex typescript is not good
- deployment: paas (eg railway/render); can't deploy ai backend on serverless (eg vercel) b/c ai takes too long to run (will get shut down by vercel)

##### stateful (db)

1. app/user data: paas (eg neon)
2. vectors: paas (eg neon pgvector, pinecone), caas/iaas/onpremise (eg chromadb)
3. checkpointers: paas (eg neon)

##### cache

1. rag files: cdn (eg uploadthing)

##### cache/cdn

- blob storage: uploadthing

### rag

##### indexing: includes parsing, chunking, creating embeddings, and creating the index

- Document obj: a container for an entire file (eg a whole pdf). Holds both text and metadata
- Node: a chunk of a document obj. Holds text (or embeddings of that text), metadata, relationships with the doc.
- Collection: a vector db can have many collections. Each collection has nodes from different documents. Each collection has a separate vector space for the embeddings.
- Index: a data structure that allows you to retrieve easily from 1 collection. Each collection has its own index.

##### llamaindex

- Does different parsing/chunking for you based on your file
- You just need 2 lines of code that uses SimpleDirectoryReader and VectorStoreIndex
- Then you can use it just for retrieving, ie index.as_retriever(), or for both retrieving and inference, ie index.as_query_engine()
- For llamaindex, set arbitrary embed and inference models via Settings.embed_model and Settings.llm (default is openai for both)
- If your app is 90% RAG (reading pdfs), use llamaindex for inference as well; otherwise use llamaindex to index/retrieve and langchain for inference and orchestration

### agent/workflow orchestration

##### langchain vs langgraph

- langchain: allows workflow without loops
- langgraph: allows loops in the workflow (eg model can check its own response and regenerate the response if it was bad)
- langgraph is built on top of langchain

##### langchain inference model selection methods

1. Using provider library, eg. from openai import OpenAI

- Pros: precise control, easier debuggin (you know exactly what is being sent), new features available asap
- Cons: have to rewrite all API calls when you switch provider

2. Using langchain standard abstraction layer, eg. from langchain_openai import ChatOpenAI (returns standard langchain chat obj; just run obj.invoke("question") to get a response)

- Pros: written in langchain code, just import a different class when you switch provider
- Cons: need multiple imports (or if/else imports) if you want users to select different models

3. Using langchain unified abstraction layer, eg. from langchain.chat_models import init_chat_model (also returns standard langchain chat obj)

- Pros: just use a different string when you switch model; standard for langchain/langgraph since late 2024
- Cons: some milliseconds of latency looking up correct models dynamically

##### 2026 inference model selection standards

1. LangGraph

- Who: enterprises building complex, multi-step agents
- Why: features like memory, checkpointers, human-in-the-loop are hard to build from scratch
- Code: write in langchain/graph code, then use init_chat_model

2. PydanticAI (competes with langchain)

- Code: uses pydantic obj for everything (memory, tools, inference model responses), uses Instructor to force inference model to output into pydantic obj
- Why: everything is type safe, transparent & easy to debug (whereas langchain needs langsmith for debugging due to non-transparency)

3. LLM Gateways (eg LiteLLM, Portkey)

- Code: write everything in openai code, then call the gateway, which decides what model to send request to

##### langchain type safety

1. Inputs (tools): should be strictly typed

- no need to write pydantic obj for tools
- just declare input/output types for the function
- then the @tool decorator will use pydantic under the hood

2. Outputs (inference model responses): should be strictly typed to better integrate with app/business logic

- just declare a pydantic obj and pass to langchain chat obj (created either via standard/unified abstraction) via with_structure_output()
- new_chat_obj = langchain_chat_obj.with_structured_output(pydantic_model)

3. The middle (reasoning/memory): keep it flexible; just let langchain handle it; don't over-engineer the thinking process

- in langchain, hard to force types on memory
- in langgraph, can use pydantic/TypedDict to define memory structure

##### langchain memory

1. short-term memory: memory within 1 conversation (each conversation has a different thread id)

- use checkpointer: every time the model uses a tool, outputs something, etc, the checkpointer automatically saves it to a dict that lives in a database (PostgresSaver/SqliteSaver/etc) or in memory (InMemorySaver, only really used if you don't have db set up yet)

2. long-term memory: memory that spans all conversations

- 2 types: user info (personalization), doc info (company policies, user uploaded files, etc)
- user info: new rag for each app in the past; now uses store (InMemoryStore/PostgresStore/etc); dev or agent decides what should be stored in long term memory; rag under the hood (returns relevant info based on a query)
- doc info: implement your own rag for each app; use either llamaindex VectorStoreIndex or langchain VectorStore

# Todo

- finish scaling and ai stack/deployment section
