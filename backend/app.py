from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import numpy as np
from sklearn.datasets import fetch_openml
import umap
from sklearn.manifold import TSNE
import logging
from PIL import Image
import io

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)

class UMAPExplorer:
    def __init__(self):
        self.mnist = None
        self.labels = None
        self.original_mnist = None  # Explicitly initialize
        self.umap_embeddings = None
        self.tsne_embeddings = None
        self.n_samples = None
        self.sample_indices = None
        
    def ensure_data_loaded(self, n_samples=None):
        """Ensure MNIST data is loaded with the specified number of samples"""
        if self.mnist is None or (n_samples is not None and n_samples != self.n_samples):
            self.load_mnist(n_samples)
        return True
        
    def load_mnist(self, n_samples=None):
        logger.info("Loading MNIST data...")
        # Load MNIST
        mnist_data = fetch_openml('mnist_784', version=1, parser='auto')
        full_mnist = mnist_data.data.to_numpy()
        full_labels = mnist_data.target.to_numpy()
        
        if n_samples is not None:
            # Take a random subset of the data with fixed seed for consistency
            rng = np.random.RandomState(42)
            self.sample_indices = rng.choice(len(full_mnist), n_samples, replace=False)
            self.mnist = full_mnist[self.sample_indices]
            self.labels = full_labels[self.sample_indices]
            self.n_samples = n_samples
        else:
            self.mnist = full_mnist
            self.labels = full_labels
            self.n_samples = len(full_mnist)
            self.sample_indices = np.arange(len(full_mnist))
        
        # Store original data before normalization for image generation
        self.original_mnist = self.mnist.copy()
        
        # Normalize the data for embeddings
        self.mnist = self.mnist / 255.0
        logger.info(f"Loaded MNIST data with shape: {self.mnist.shape}")
    
    def get_mnist_image(self, index):
        """Convert MNIST data to PNG image"""
        if not self.ensure_data_loaded():
            return None
            
        if index < 0 or index >= len(self.original_mnist):
            return None
            
        image_data = self.original_mnist[index].reshape(28, 28).astype(np.uint8)
        image = Image.fromarray(image_data)
        img_io = io.BytesIO()
        image.save(img_io, 'PNG')
        img_io.seek(0)
        return img_io
    
    def get_sprite_sheet(self, start, count):
        """Generate a sprite sheet with multiple MNIST images"""
        if not self.ensure_data_loaded():
            return None
            
        if start < 0 or start + count > len(self.original_mnist):
            return None
        
        # Calculate sprite sheet dimensions
        side_length = int(np.ceil(np.sqrt(count)))
        sheet_size = side_length * 28
        
        # Create blank sprite sheet
        sheet = Image.new('L', (sheet_size, sheet_size), 0)
        
        # Place images in sprite sheet
        for i in range(count):
            if start + i >= len(self.original_mnist):
                break
            image_data = self.original_mnist[start + i].reshape(28, 28).astype(np.uint8)
            image = Image.fromarray(image_data)
            x = (i % side_length) * 28
            y = (i // side_length) * 28
            sheet.paste(image, (x, y))
        
        # Convert to bytes
        img_io = io.BytesIO()
        sheet.save(img_io, 'PNG')
        img_io.seek(0)
        return img_io
    
    def compute_umap(self, n_neighbors=15, min_dist=0.1, metric='euclidean', n_samples=1000):
        """Compute UMAP embeddings with given parameters"""
        self.ensure_data_loaded(n_samples=n_samples)
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
        self.ensure_data_loaded(n_samples=n_samples)
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

@app.route('/api/config')
def get_config():
    """Get current configuration including number of samples"""
    explorer.ensure_data_loaded()  # Ensure data is loaded
    return jsonify({
        'n_samples': explorer.n_samples if explorer.n_samples is not None else 0,
        'sample_indices': explorer.sample_indices.tolist() if explorer.sample_indices is not None else []
    })

@app.route('/api/mnist/<int:index>')
def get_image(index):
    """Get individual MNIST image"""
    explorer.ensure_data_loaded()  # Ensure data is loaded
    
    # Convert global index to sampled index if needed
    if explorer.sample_indices is not None:
        if index >= len(explorer.sample_indices):
            return jsonify({'error': 'Index out of range'}), 404
        actual_index = index
    else:
        actual_index = index
    
    img_io = explorer.get_mnist_image(actual_index)
    if img_io is None:
        return jsonify({'error': 'Index out of range'}), 404
    
    return send_file(img_io, mimetype='image/png')

@app.route('/api/mnist/sprite/<int:start>/<int:count>')
def get_sprite_sheet(start, count):
    """Generate a sprite sheet with multiple MNIST images"""
    explorer.ensure_data_loaded()  # Ensure data is loaded
    
    # Ensure we don't exceed the number of samples
    if explorer.n_samples is not None:
        count = min(count, explorer.n_samples - start)
        if start >= explorer.n_samples:
            return jsonify({'error': 'Start index exceeds number of samples'}), 404
    
    img_io = explorer.get_sprite_sheet(start, count)
    if img_io is None:
        return jsonify({'error': 'Invalid range'}), 404
    
    return send_file(img_io, mimetype='image/png')

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
    # Load data at startup
    explorer.ensure_data_loaded(n_samples=1000)
    app.run(debug=True, port=5000) 