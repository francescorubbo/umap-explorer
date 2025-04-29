import React, { Component } from 'react'
import { BACKEND_URL, fetchBackendConfig } from './config'

class Sidebar extends Component {
  constructor(props) {
    super(props)
    this.state = {
      currentImage: null,
      nSamples: 0,
      loading: true,
      error: null
    }
    this.canvasRef = React.createRef()
    this.handleSelectAlgorithm = this.handleSelectAlgorithm.bind(this)
  }

  async componentDidMount() {
    try {
      const config = await fetchBackendConfig();
      this.setState({ 
        nSamples: config.nSamples,
        loading: false 
      }, () => {
        if (this.canvasRef.current) {
          const canvas = this.canvasRef.current;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          this.props.setSidebarCanvas(canvas);
        }
      });
    } catch (error) {
      console.error('Error loading configuration:', error);
      this.setState({ error: error.message, loading: false });
    }
  }

  async loadImage(index) {
    if (index === null || index >= this.state.nSamples) {
      this.setState({ currentImage: null });
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/mnist/${index}`);
      if (!response.ok) {
        throw new Error(`Failed to load image: ${response.statusText}`);
      }
      const blob = await response.blob();
      const img = document.createElement('img');
      img.src = URL.createObjectURL(blob);
      await new Promise(resolve => {
        img.onload = resolve;
      });
      this.setState({ currentImage: img }, this.updateCanvas);
    } catch (error) {
      console.error('Error loading image:', error);
      this.setState({ error: error.message });
    }
  }

  updateCanvas() {
    const { currentImage } = this.state
    const canvas = this.canvasRef.current
    if (!canvas || !currentImage) return

    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(currentImage, 0, 0, canvas.width, canvas.height)
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevProps.selectedIndex !== this.props.selectedIndex) {
      this.loadImage(this.props.selectedIndex);
    }
    
    if (!prevState.loading && this.state.loading === false && this.canvasRef.current) {
      const canvas = this.canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      this.props.setSidebarCanvas(canvas);
    }
  }

  handleSelectAlgorithm(e) {
    let v = e.target.value
    this.props.selectAlgorithm(v)
  }

  render() {
    const { loading, error } = this.state;
    if (loading) {
      return <div style={{ padding: '1rem' }}>Loading configuration...</div>;
    }

    if (error) {
      return <div style={{ padding: '1rem', color: 'red' }}>Error: {error}</div>;
    }

    let {
      sidebar_orientation,
      sidebar_image_size,
      grem,
      p,
      hover_index,
      mnist_labels,
      color_array,
      algorithm_options,
      algorithm_choice,
    } = this.props

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexGrow: 1,
        }}
      >
        <div>
          {' '}
          <div
            style={{
              padding: grem / 2,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>Algorithm:</div>
            <select
              onChange={this.handleSelectAlgorithm}
              value={algorithm_options[algorithm_choice]}
            >
              {algorithm_options.map((option, index) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection:
                sidebar_orientation === 'horizontal' ? 'row' : 'column',
            }}
          >
            <div>
              <canvas
                ref={this.canvasRef}
                width={sidebar_image_size}
                height={sidebar_image_size}
                style={{
                  imageRendering: 'pixelated',
                  border: '1px solid #ddd',
                  background: 'white',
                  marginBottom: '1em'
                }}
              />
            </div>
            <div style={{ flexGrow: 1 }}>
              <div
                style={{
                  background: hover_index
                    ? `rgb(${color_array[mnist_labels[hover_index]].join(',')})`
                    : 'transparent',
                  color: hover_index ? '#000' : '#fff',
                  padding: p(grem / 4, grem / 2),
                  display: 'flex',
                  justifyContent: 'space-between',
                  transition: 'all 0.1s linear',
                }}
              >
                <div>Label:</div>
                {hover_index ? <div>{mnist_labels[hover_index]}</div> : null}
              </div>
              <div
                style={{
                  padding: p(grem / 4, grem / 2),
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                Index:
                {hover_index ? <div>{hover_index}</div> : null}
              </div>
            </div>
          </div>
        </div>
        <div style={{ padding: grem / 2 }}>
          <div>
            An interactive UMAP visualization of the MNIST data set.{' '}
            <button
              onClick={() => {
                this.props.toggleAbout(true)
              }}
            >
              About
            </button>
          </div>
        </div>
      </div>
    )
  }
}

export default Sidebar
