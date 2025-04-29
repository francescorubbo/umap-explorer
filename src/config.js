import * as d3 from 'd3';

// Backend API configuration
export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:5000';

// MNIST image configuration
export const SPRITE_SIDE = 73;
export const SPRITE_SIZE = SPRITE_SIDE * SPRITE_SIDE;
export const SPRITE_NUMBER = 14;
export const SPRITE_IMAGE_SIZE = 28;
export const SPRITE_ACTUAL_SIZE = 2048; // needs to be power of 2

// Zoom scaling function
export const zoomScaler = input => {
  const scale = d3.scaleLinear()
    .domain([20, 5])
    .range([14, 28])
    .clamp(true);
  
  if (input >= 5) {
    return scale(input);
  } else {
    return 28;
  }
};

// Backend API functions
export async function fetchBackendConfig() {
  const response = await fetch(`${BACKEND_URL}/api/config`);
  const config = await response.json();
  return {
    nSamples: config.n_samples,
    sampleIndices: config.sample_indices,
    spriteSide: Math.ceil(Math.sqrt(config.n_samples)), // Calculate sprite side based on n_samples
    spriteSize: config.n_samples
  };
}

export async function fetchSpriteSheet(start, count) {
  const response = await fetch(`${BACKEND_URL}/api/mnist/sprite/${start}/${count}`);
  if (!response.ok) {
    throw new Error(`Failed to load sprite sheet: ${response.statusText}`);
  }
  const blob = await response.blob();
  return new Promise((resolve) => {
    const img = document.createElement('img');
    img.onload = () => resolve(img);
    img.src = URL.createObjectURL(blob);
  });
} 