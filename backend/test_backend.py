from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from main import app
from dataclasses import dataclass
import pytest

client = TestClient(app)

def test_read_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json() == {"message": "PaperParrot Backend is running"}

@patch('main.requests.get')
@patch('rag_utils.PGVectorStore')
def test_index_file(mock_pg_vector, mock_requests_get):
    # Mock download
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.content = b"This is a test document content about PaperParrot."
    mock_requests_get.return_value = mock_response
    
    # Mock VectorStore
    mock_store = MagicMock()
    mock_pg_vector.from_params.return_value = mock_store
    
    with patch('main.SimpleDirectoryReader') as mock_reader, \
         patch('main.VectorStoreIndex') as mock_index, \
         patch('main.get_vector_store') as mock_get_store:
         
        mock_get_store.return_value = mock_store
        
        # Mock documents
        mock_doc = MagicMock()
        mock_doc.metadata = {}  # Use real dict for metadata
        mock_reader.return_value.load_data.return_value = [mock_doc]
        
        response = client.post("/api/index-file", json={
            "file_url": "http://example.com/test.txt",
            "file_id": "file_123",
            "conversation_id": "conv_456"
        })
        
        assert response.status_code == 200
        assert response.json()["status"] == "success"
        
        # Verify metadata set
        assert mock_doc.metadata["conversation_id"] == "conv_456"
        assert mock_doc.metadata["file_id"] == "file_123"

@dataclass
class MockResponseFormat:
    final_answer: str
    did_search_internet: bool

@patch('main.create_rag_agent')
def test_chat(mock_create_agent):
    mock_agent = MagicMock()
    mock_create_agent.return_value = mock_agent
    
    mock_response = {
        "structured_response": MockResponseFormat(
            final_answer="PaperParrot is a bird.",
            did_search_internet=False
        )
    }
    mock_agent.invoke.return_value = mock_response
    
    response = client.post("/api/chat", json={
        "message": "What is PaperParrot?",
        "conversation_id": "conv_456"
    })
    
    assert response.status_code == 200
    assert response.json()["answer"] == "PaperParrot is a bird."
    assert response.json()["sources"] == "documents"

@patch('main.delete_file_by_id')
def test_delete_file(mock_delete):
    response = client.post("/api/delete-file", json={
        "file_id": "file_123",
        "conversation_id": "conv_456"
    })
    
    assert response.status_code == 200
    mock_delete.assert_called_with("file_123")
