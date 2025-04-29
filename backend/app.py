from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
from sklearn.datasets import fetch_openml
import umap
from sklearn.manifold import TSNE
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class UMAPExplorer:
    def __init__(self):
        self.mnist = None
        self.labels = None
        self.umap_embeddings = None
        self.tsne_embeddings = None
        
    def load_mnist(self, n_samples=None):
        if self.mnist is None:
            logger.info("Loading MNIST data...")
            # Load a subset of MNIST for faster testing
            mnist_data = fetch_openml('mnist_784', version=1, parser='auto')
            self.mnist = mnist_data.data.to_numpy()
            self.labels = mnist_data.target.to_numpy()
            
            if n_samples is not None:
                # Take a random subset of the data
                indices = np.random.choice(len(self.mnist), n_samples, replace=False)
                self.mnist = self.mnist[indices]
                self.labels = self.labels[indices]
            
            # Normalize the data
            self.mnist = self.mnist / 255.0
            logger.info(f"Loaded MNIST data with shape: {self.mnist.shape}")
            
    def compute_umap(self, n_neighbors=15, min_dist=0.1, metric='euclidean', n_samples=1000):
        """Compute UMAP embeddings with given parameters"""
        self.load_mnist(n_samples=n_samples)
        logger.info(f"Computing UMAP with parameters: n_neighbors={n_neighbors}, min_dist={min_dist}")
        
        reducer = umap.UMAP(
            n_neighbors=n_neighbors,
            min_dist=min_dist,
            metric=metric,
            random_state=42
        )
        self.umap_embeddings = reducer.fit_transform(self.mnist)
        logger.info(f"UMAP embeddings shape: {self.umap_embeddings.shape}")
        return self.umap_embeddings
    
    def compute_tsne(self, n_samples=1000):
        """Compute t-SNE embeddings"""
        self.load_mnist(n_samples=n_samples)
        logger.info("Computing t-SNE embeddings")
        
        if self.tsne_embeddings is None:
            tsne = TSNE(n_components=2, random_state=42)
            self.tsne_embeddings = tsne.fit_transform(self.mnist)
            logger.info(f"t-SNE embeddings shape: {self.tsne_embeddings.shape}")
        return self.tsne_embeddings
    
    def get_data(self, algorithm='umap', params=None):
        """Get embeddings for the specified algorithm with parameters"""
        if params is None:
            params = {}
            
        n_samples = params.pop('n_samples', 1000)
        
        try:
            if algorithm == 'umap':
                embeddings = self.compute_umap(n_samples=n_samples, **params)
            elif algorithm == 'tsne':
                embeddings = self.compute_tsne(n_samples=n_samples)
            else:
                raise ValueError(f"Unknown algorithm: {algorithm}")
                
            return {
                'embeddings': embeddings.tolist(),
                'labels': self.labels.tolist() if self.labels is not None else None
            }
        except Exception as e:
            logger.error(f"Error computing embeddings: {str(e)}")
            raise

# Create a single instance of UMAPExplorer
explorer = UMAPExplorer()

@app.route('/api/compute', methods=['POST'])
def compute_embedding():
    """Endpoint to compute embeddings with specified algorithm and parameters"""
    try:
        data = request.get_json()
        algorithm = data.get('algorithm', 'umap')
        params = data.get('params', {})
        
        logger.info(f"Received request for {algorithm} with params: {params}")
        result = explorer.get_data(algorithm, params)
        return jsonify(result)
    except Exception as e:
        logger.error(f"Error processing request: {str(e)}")
        return jsonify({'error': str(e)}), 400

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({'status': 'healthy'})

if __name__ == '__main__':
    app.run(debug=True, port=5000) 