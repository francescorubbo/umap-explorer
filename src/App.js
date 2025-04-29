import React, { useState, useEffect } from 'react';
import Layout from './Layout';
import LoadingSpinner from './components/LoadingSpinner';
import { fetchEmbeddings, checkBackendHealth } from './api';

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [backendHealthy, setBackendHealthy] = useState(true);

  useEffect(() => {
    const checkHealth = async () => {
      const isHealthy = await checkBackendHealth();
      setBackendHealthy(isHealthy);
      return isHealthy;
    };

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // First check if backend is healthy
        const isHealthy = await checkHealth();
        if (!isHealthy) {
          setError('Backend service is not available');
          return;
        }

        // Fetch both UMAP and t-SNE embeddings with 1000 samples
        const params = { n_samples: 1000 };
        const [umapData, tsneData] = await Promise.all([
          fetchEmbeddings('umap', params),
          fetchEmbeddings('tsne', params)
        ]);

        setData({
          mnist_embeddings: umapData.embeddings,
          tsne_mnist_embeddings: tsneData.embeddings,
          mnist_labels: umapData.labels,
          algorithm_options: ['UMAP', 't-SNE'],
          algorithm_embedding_keys: ['mnist_embeddings', 'tsne_mnist_embeddings']
        });
      } catch (err) {
        setError(err.message);
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  if (!backendHealthy) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
        <h2>Backend Service Unavailable</h2>
        <p>Please make sure the Python backend is running on http://localhost:5000</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h2>Computing Embeddings</h2>
        <LoadingSpinner />
        <p>This may take a few moments...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'red' }}>
        <h2>Error</h2>
        <p>{error}</p>
        <button 
          onClick={() => window.location.reload()} 
          style={{
            padding: '0.5rem 1rem',
            marginTop: '1rem',
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  return data ? <Layout {...data} /> : null;
}

export default App;
