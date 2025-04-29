# UMAP Explorer Backend

This is the Python backend for the UMAP Explorer application. It provides APIs for computing UMAP and t-SNE embeddings of the MNIST dataset.

## Setup

1. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows use: venv\Scripts\activate
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the server:
```bash
python app.py
```

The server will start on http://localhost:5000

## API Endpoints

### POST /api/compute
Compute embeddings using specified algorithm and parameters.

Request body:
```json
{
    "algorithm": "umap",  // or "tsne"
    "params": {
        "n_neighbors": 15,
        "min_dist": 0.1,
        "metric": "euclidean",
        "n_samples": 1000
    }
}
```

Response:
```json
{
    "embeddings": [[x1, y1], [x2, y2], ...],
    "labels": ["0", "1", ...]
}
```

### GET /api/health
Health check endpoint.

Response:
```json
{
    "status": "healthy"
}
```

## Development

- The application uses Flask and CORS to allow cross-origin requests from the frontend
- MNIST data is loaded and cached in memory
- Both UMAP and t-SNE computations are supported
- Logging is configured to help with debugging 