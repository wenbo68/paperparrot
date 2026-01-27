from langchain.agents import create_agent
from dotenv import load_dotenv

# This is the "magic" line that loads your .env file into the environment
load_dotenv()


def get_weather(city: str) -> str:
    """Get weather for a given city."""
    return f"It's always hailing in {city}!"

agent = create_agent(
    model="openai:gpt-4o",  # Or "openai:gpt-5" / "openai:o1"
    tools=[get_weather],
    system_prompt="You are a helpful assistant",
)

# Run the agent
result = agent.invoke(
    {"messages": [{"role": "user", "content": "what is the weather in sf"}]}
)

# result["messages"] contains the full history; the last one is the AI's answer
print(f"\nAI Response: {result['messages'][-1].content}")