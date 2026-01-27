from openai import OpenAI
from dotenv import load_dotenv
from langsmith.wrappers import wrap_openai  # traces openai calls
from langsmith import traceable

load_dotenv()

def retriever(query: str):
    # Minimal example retriever
    return ["Harrison worked at Kensho"]

# the wrapper will show all inputs to the client (see below: model, system, user/human)
# will also show the output of the client
# will also show total tokens used (for both input and output) and cost
client = wrap_openai(OpenAI()) 

# @traceable on a function will only show input/output of that function
@traceable
def rag(question: str) -> str:
    docs = retriever(question)
    system_message = (
        "Answer the user's question using only the provided information below:\n"
        + "\n".join(docs)
    )

    # as mentioned above, the input/output/tokens will be traced
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": system_message},
            {"role": "user", "content": question},
        ],
    )
    return resp.choices[0].message.content

if __name__ == "__main__":
    print(rag("Where did Harrison work?"))