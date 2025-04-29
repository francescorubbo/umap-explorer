const API_BASE_URL = 'http://127.0.0.1:5000/api';

/**
 * Fetches embeddings from the backend using the specified algorithm and parameters
 * @param {string} algorithm - 'umap' or 'tsne'
 * @param {Object} params - Parameters for the algorithm
 * @returns {Promise<{embeddings: number[][], labels: string[]}>}
 */
export const fetchEmbeddings = async (algorithm = 'umap', params = {}) => {
  try {
    const response = await fetch(`${API_BASE_URL}/compute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ algorithm, params }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch embeddings');
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching embeddings:', error);
    throw error;
  }
};

/**
 * Checks if the backend is healthy
 * @returns {Promise<boolean>}
 */
export const checkBackendHealth = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const data = await response.json();
    return data.status === 'healthy';
  } catch (error) {
    console.error('Error checking backend health:', error);
    return false;
  }
}; 