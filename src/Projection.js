import React, { Component } from 'react'
import * as THREE from 'three'
import * as _ from 'lodash'
import * as d3 from 'd3'
import * as TWEEN from '@tweenjs/tween.js'
import {
  BACKEND_URL,
  SPRITE_SIDE,
  SPRITE_SIZE,
  SPRITE_NUMBER,
  SPRITE_IMAGE_SIZE,
  SPRITE_ACTUAL_SIZE,
  zoomScaler,
  fetchBackendConfig,
  fetchSpriteSheet
} from './config'

// Constants for sprite sheets
let sprite_side = SPRITE_SIDE
let sprite_size = SPRITE_SIZE
let sprite_number = SPRITE_NUMBER
let sprite_image_size = SPRITE_IMAGE_SIZE
// actual sprite size needs to be power of 2
let sprite_actual_size = SPRITE_ACTUAL_SIZE

async function loadSpriteSheet(start, count) {
  const response = await fetch(`${BACKEND_URL}/api/mnist/sprite/${start}/${count}`)
  const blob = await response.blob()
  return new Promise((resolve) => {
    let img = document.createElement('img')
    img.onload = () => resolve(img)
    img.src = URL.createObjectURL(blob)
  })
}

class Projection extends Component {
  constructor(props) {
    super(props)
    this.state = {
      spriteSheets: [],
      spriteSide: 0,
      spriteSize: 0,
      nSamples: 0,
      loading: true,
      error: null
    }
    this.init = this.init.bind(this)
    this.addPoints = this.addPoints.bind(this)
    this.handleResize = this.handleResize.bind(this)
    this.setUpCamera = this.setUpCamera.bind(this)
    this.animate = this.animate.bind(this)
    this.getScaleFromZ = this.getScaleFromZ.bind(this)
    this.getZFromScale = this.getZFromScale.bind(this)
    this.changeEmbeddings = this.changeEmbeddings.bind(this)
    this.loadAllSpriteSheets = this.loadAllSpriteSheets.bind(this)
  }

  async loadAllSpriteSheets() {
    try {
      // Fetch backend configuration
      const config = await fetchBackendConfig();
      
      // Calculate how many sprite sheets we need
      const sheetsNeeded = Math.ceil(config.nSamples / config.spriteSize);
      const sheets = [];
      this.textures = [];  // Three.js textures
      this.spriteImages = [];  // HTML images for canvas
      
      // Load each sprite sheet
      for (let i = 0; i < sheetsNeeded; i++) {
        const start = i * config.spriteSize;
        const count = Math.min(config.spriteSize, config.nSamples - start);
        const sheet = await fetchSpriteSheet(start, count);
        sheets.push(sheet);
        
        // Create Three.js texture
        const texture = new THREE.Texture(sheet);
        texture.flipY = false;
        texture.needsUpdate = true;
        texture.magFilter = THREE.NearestFilter;
        this.textures.push(texture);
        
        // Store the HTML image
        this.spriteImages.push(sheet);
      }
      
      this.setState({
        spriteSheets: sheets,
        spriteSide: config.spriteSide,
        spriteSize: config.spriteSize,
        nSamples: config.nSamples,
        loading: false
      }, () => {
        if (this.scene) {
          this.updateTextures();
        } else {
          this.init();
        }
      });
    } catch (error) {
      console.error('Error loading sprite sheets:', error);
      this.setState({ error: error.message, loading: false });
    }
  }

  updateTextures() {
    const { spriteSheets } = this.state;
    if (!spriteSheets.length) return;

    const pointGroup = this.scene.children[0];
    spriteSheets.forEach((sheet, i) => {
      if (pointGroup.children[i]) {
        pointGroup.children[i].material.uniforms.texture.value = this.textures[i];
      }
    });
  }

  changeEmbeddings(prev_choice, new_choice) {
    // assumes mnist embeddings has been updated

    let ranges = []
    for (let i = 0; i < sprite_number; i++) {
      let start = i * sprite_size
      let end = (i + 1) * sprite_size
      if (i === sprite_number - 1) end = sprite_number * sprite_size
      ranges.push([start, end])
    }

    let embedding_chunks = ranges.map(range =>
      this.props[this.props.algorithm_embedding_keys[new_choice]].slice(
        range[0],
        range[1]
      )
    )

    for (let c = 0; c < sprite_number; c++) {
      let echunk = embedding_chunks[c]

      let points = this.scene.children[0].children[c]
      let numVertices = echunk.length
      let position = points.geometry.attributes.position.array
      let target = new Float32Array(numVertices * 3)
      for (let i = 0, index = 0, l = numVertices; i < l; i++, index += 3) {
        let x = echunk[i][0]
        let y = echunk[i][1]
        let z = 0
        target[index] = x
        target[index + 1] = y
        target[index + 2] = z
      }

      let tween = new TWEEN.Tween(position)
        .to(target, 1000)
        .easing(TWEEN.Easing.Linear.None)
      tween.onUpdate(function() {
        points.geometry.attributes.position = new THREE.BufferAttribute(
          position,
          3
        )
        points.geometry.attributes.position.needsUpdate = true // required after the first render
      })
      tween.start()
    }
  }

  getZFromScale(scale) {
    let rvFOV = THREE.MathUtils.degToRad(this.camera.fov)
    let scale_height = this.props.height / scale
    let camera_z_position = scale_height / (2 * Math.tan(rvFOV / 2))
    return camera_z_position
  }

  getScaleFromZ(camera_z_position) {
    let rvFOV = THREE.MathUtils.degToRad(this.camera.fov)
    let half_fov_height = Math.tan(rvFOV / 2) * camera_z_position
    let fov_height = half_fov_height * 2
    let scale = this.props.height / fov_height
    return scale
  }

  handleResize = (width, height) => {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height)
    let current_scale = this.getScaleFromZ(this.camera.position.z)
    let d3_x = -(this.camera.position.x * current_scale) + this.props.width / 2
    let d3_y = this.camera.position.y * current_scale + this.props.height / 2
    var resize_transform = d3.zoomIdentity
      .translate(d3_x, d3_y)
      .scale(current_scale)
    let view = d3.select(this.mount)
    this.d3_zoom.transform(view, resize_transform)
  }

  zoomHandler(event) {
    let d3_transform = event.transform

    let scale = d3_transform.k
    let x = -(d3_transform.x - this.props.width / 2) / scale
    let y = (d3_transform.y - this.props.height / 2) / scale
    let z = this.getZFromScale(scale)

    this.camera.position.set(x, y, z)

    // point size scales at end of zoom
    let new_size = zoomScaler(z)
    let point_group = this.scene.children[0].children
    for (let c = 0; c < point_group.length; c++) {
      point_group[c].material.uniforms.size.value = new_size
    }
  }

  setUpCamera() {
    let { width, height, mnist_embeddings } = this.props

    let aspect = this.camera.aspect
    let vFOV = this.camera.fov
    let rvFOV = THREE.MathUtils.degToRad(vFOV)

    let xs = mnist_embeddings.map(e => e[0])
    let min_x = _.min(xs)
    let max_x = _.max(xs)
    let ys = mnist_embeddings.map(e => e[1])
    let min_y = _.min(ys)
    let max_y = _.max(ys)
    let data_width = max_x - min_x
    let data_height = max_y - min_y
    let data_aspect = data_width / data_height

    let max_x_from_center = _.max([min_x, max_x].map(m => Math.abs(m)))
    let max_y_from_center = _.max([min_y, max_y].map(m => Math.abs(m)))

    let max_center = Math.max(max_x_from_center, max_y_from_center)

    let camera_z_start
    if (data_aspect > aspect) {
      // console.log("width is limiter");
      // camera_z_start = max_x_from_center / Math.tan(rvFOV / 2) / aspect
    } else {
      // console.log("height is limiter");
      // camera_z_start = max_y_from_center / Math.tan(rvFOV / 2)
    }

    camera_z_start = max_center / Math.tan(rvFOV / 2)

    let far = camera_z_start * 1.25
    this.camera.far = far
    this.camera.position.z = camera_z_start * 1.1

    // set up zoom
    this.d3_zoom = d3
      .zoom()
      .scaleExtent([this.getScaleFromZ(far - 1), this.getScaleFromZ(0.1)])
      .on('zoom', this.zoomHandler.bind(this))

    let view = d3.select(this.mount)
    this.view = view
    view.call(this.d3_zoom)
    let initial_scale = this.getScaleFromZ(this.camera.position.z)
    var initial_transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(initial_scale)
    this.d3_zoom.transform(view, initial_transform)
  }

  addPoints() {
    let { mnist_embeddings, mnist_labels, color_array } = this.props
    const { spriteSize, spriteSide } = this.state

    // split embeddings and labels into chunks to match sprites
    let ranges = []
    for (let i = 0; i < this.textures.length; i++) {
      let start = i * spriteSize
      let end = (i + 1) * spriteSize
      if (i === this.textures.length - 1) end = mnist_embeddings.length
      ranges.push([start, end])
    }
    let embedding_chunks = ranges.map(range =>
      mnist_embeddings.slice(range[0], range[1])
    )
    let label_chunks = ranges.map(range =>
      mnist_labels.slice(range[0], range[1])
    )

    let point_group = new THREE.Group()
    for (let c = 0; c < this.textures.length; c++) {
      let echunk = embedding_chunks[c]
      let lchunk = label_chunks[c]

      let vertices = []
      for (let v = 0; v < echunk.length; v++) {
        let embedding = echunk[v]
        let vert = new THREE.Vector3(embedding[0], embedding[1], 0)
        vertices[v] = vert
      }

      let geometry = new THREE.BufferGeometry()

      let numVertices = vertices.length
      let positions = new Float32Array(numVertices * 3)
      let offsets = new Float32Array(numVertices * 2)
      let colors = new Float32Array(numVertices * 3)
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 2))
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))

      for (let i = 0, index = 0, l = numVertices; i < l; i++, index += 3) {
        let x = echunk[i][0]
        let y = echunk[i][1]
        let z = 0
        positions[index] = x
        positions[index + 1] = y
        positions[index + 2] = z
      }

      let texture_subsize = 1 / spriteSide

      for (let i = 0, index = 0, l = numVertices; i < l; i++, index += 2) {
        let x = (i % spriteSide) / spriteSide
        let y = Math.floor(i / spriteSide) / spriteSide
        offsets[index] = x
        offsets[index + 1] = y
      }

      for (let i = 0, index = 0, l = numVertices; i < l; i++, index += 3) {
        let color = color_array[lchunk[i]]
        colors[index] = color[0] / 255
        colors[index + 1] = color[1] / 255
        colors[index + 2] = color[2] / 255
      }

      // uniforms
      let uniforms = {
        textureMap: { value: this.textures[c] },
        repeat: { value: new THREE.Vector2(texture_subsize, texture_subsize) },
        size: { value: SPRITE_IMAGE_SIZE },
      }

      let vertex_shader = `
        attribute vec2 offset;
        varying vec2 vOffset;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float size;
        void main() {
          vOffset = offset;
          vColor = color;
          gl_PointSize = size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`

      let fragment_shader = `
        uniform sampler2D textureMap;
        uniform vec2 repeat;
        varying vec2 vOffset;
        varying vec3 vColor;
        void main() {
          vec2 uv = vec2( gl_PointCoord.x, gl_PointCoord.y );
          vec2 spriteUV = vOffset + (uv * repeat);
          vec4 tex = texture2D( textureMap, spriteUV );
          if ( tex.r < 0.5 ) discard;
          gl_FragColor = vec4(vColor, tex.r);
        }`

      // material
      let material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertex_shader,
        fragmentShader: fragment_shader,
        transparent: true
      })

      // point cloud
      let point_cloud = new THREE.Points(geometry, material)
      point_cloud.userData = { sprite_index: c }

      point_group.add(point_cloud)
    }

    this.scene.add(point_group)
  }

  addBlankHighlightPoints() {
    let hover_container = new THREE.Group()
    this.scene.add(hover_container)

    let vert = new THREE.Vector3(0, 0, 0)
    let vertices = [vert]
    let geometry = new THREE.BufferGeometry()
    let numVertices = vertices.length
    var positions = new Float32Array(numVertices * 3)
    var offsets = new Float32Array(numVertices * 2)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('offset', new THREE.BufferAttribute(offsets, 2))

    let texture_subsize = 1 / this.state.spriteSide

    // uniforms
    let uniforms = {
      textureMap: { value: this.textures[0] },
      repeat: { value: new THREE.Vector2(texture_subsize, texture_subsize) },
      size: { value: SPRITE_IMAGE_SIZE * 2.0 },
    }

    let vertex_shader = `
        attribute vec2 offset;
        varying vec2 vOffset;
        uniform float size;
        void main() {
          vOffset = offset;
          gl_PointSize = size;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
        }`

    let fragment_shader = `
        uniform sampler2D textureMap;
        uniform vec2 repeat;
        varying vec2 vOffset;
        void main() {
          vec2 uv = vec2( gl_PointCoord.x, gl_PointCoord.y );
          vec2 spriteUV = vOffset + (uv * repeat);
          vec4 tex = texture2D( textureMap, spriteUV );
          gl_FragColor = vec4(1.0, 1.0, 1.0, tex.r);
        }`

    // material
    var material = new THREE.ShaderMaterial({
      uniforms: uniforms,
      vertexShader: vertex_shader,
      fragmentShader: fragment_shader,
      transparent: true,
    })

    let point = new THREE.Points(geometry, material)
    point.frustumCulled = false

    this.scene.children[1].visible = false
    this.scene.children[1].add(point)
  }

  highlightPoint(sprite_index, digit_index, full_index) {
    let { algorithm_embedding_keys, algorithm_choice } = this.props

    let point = this.scene.children[1].children[0]

    let embedding = this.props[algorithm_embedding_keys[algorithm_choice]][
      full_index
    ]

    let vert = new THREE.Vector3(embedding[0], embedding[1], 0)

    var offsets = new Float32Array(2) // 2 coordinates per point

    // Calculate UV coordinates using the same normalized approach
    let x = (digit_index % this.state.spriteSide) / this.state.spriteSide
    let y = Math.floor(digit_index / this.state.spriteSide) / this.state.spriteSide
    offsets[0] = x
    offsets[1] = y

    // Replace copyVector3sArray with manual array copying
    let position = point.geometry.attributes.position.array
    position[0] = vert.x
    position[1] = vert.y
    position[2] = vert.z
    point.geometry.attributes.position.needsUpdate = true

    point.geometry.attributes.offset.array = offsets
    point.geometry.attributes.offset.needsUpdate = true // required after the first render

    // need to set attributes on geometry and uniforms on material
    point.material.uniforms.textureMap.value = this.textures[sprite_index]
  }

  removeHighlights() {
    let highlight_container = this.scene.children[1]
    let highlights = highlight_container.children
    highlight_container.remove(...highlights)
  }

  checkIntersects(mouse_position) {
    let { width, height, sidebar_ctx, sidebar_image_size } = this.props

    function mouseToThree([mouseX, mouseY]) {
      return new THREE.Vector3(
        (mouseX / width) * 2 - 1,
        -(mouseY / height) * 2 + 1,
        1
      )
    }

    function sortIntersectsByDistanceToRay(intersects) {
      return _.sortBy(intersects, 'distanceToRay')
    }

    let mouse_vector = mouseToThree(mouse_position)
    this.raycaster.setFromCamera(mouse_vector, this.camera)
    this.raycaster.params.Points.threshold = 0.25
    let intersects = this.raycaster.intersectObjects(
      this.scene.children[0].children
    )
    if (intersects[0]) {
      let sorted_intersects = sortIntersectsByDistanceToRay(intersects)
      let intersect = sorted_intersects[0]
      let sprite_index = intersect.object.userData.sprite_index
      let digit_index = intersect.index
      let full_index = sprite_index * this.state.spriteSize + digit_index
      this.props.setHoverIndex(full_index)
      this.highlightPoint(sprite_index, digit_index, full_index)
      this.scene.children[1].visible = true

      if (sidebar_ctx && this.spriteImages[sprite_index]) {
        sidebar_ctx.fillRect(0, 0, sidebar_image_size, sidebar_image_size)
        sidebar_ctx.drawImage(
          this.spriteImages[sprite_index],  // Use HTML image instead of Three.js texture
          // source rectangle
          (digit_index % this.state.spriteSide) * SPRITE_IMAGE_SIZE,
          Math.floor(digit_index / this.state.spriteSide) * SPRITE_IMAGE_SIZE,
          SPRITE_IMAGE_SIZE,
          SPRITE_IMAGE_SIZE,
          // destination rectangle
          0,
          0,
          sidebar_image_size,
          sidebar_image_size
        )
      }
    } else {
      this.props.setHoverIndex(null)
      this.scene.children[1].visible = false
      if (sidebar_ctx) {
        sidebar_ctx.fillRect(0, 0, sidebar_image_size, sidebar_image_size)
      }
    }
  }

  handleMouse() {
    let view = d3.select(this.renderer.domElement)

    this.raycaster = new THREE.Raycaster()

    view.on('mousemove', (event) => {
      let [mouseX, mouseY] = d3.pointer(event)
      let mouse_position = [mouseX, mouseY]
      this.checkIntersects(mouse_position)
    })
  }

  init() {
    let { width, height } = this.props

    this.scene = new THREE.Scene()

    let vFOV = 75
    let aspect = width / height
    let near = 0.01
    let far = 1000

    this.camera = new THREE.PerspectiveCamera(vFOV, aspect, near, far)

    this.renderer = new THREE.WebGLRenderer()
    this.renderer.setClearColor(0x111111, 1)
    this.renderer.setSize(width, height)
    this.mount.appendChild(this.renderer.domElement)

    this.addPoints()

    this.addBlankHighlightPoints()

    this.setUpCamera()

    this.animate()

    this.handleMouse()
  }

  animate() {
    requestAnimationFrame(this.animate)
    TWEEN.update()
    this.renderer.render(this.scene, this.camera)
  }

  componentDidMount() {
    this.loadAllSpriteSheets()
  }

  componentDidUpdate(prevProps) {
    let { width, height } = this.props
    if (width !== prevProps.width || height !== prevProps.height) {
      this.handleResize(width, height)
    }
    if (prevProps.algorithm_choice !== this.props.algorithm_choice) {
      this.changeEmbeddings(
        prevProps.algorithm_choice,
        this.props.algorithm_choice
      )
    }
  }

  componentWillUnmount() {
    this.mount.removeChild(this.renderer.domElement)
  }

  render() {
    const { width, height } = this.props;
    const { loading, error } = this.state;

    if (loading) {
      return <div style={{ padding: '1rem' }}>Loading sprites...</div>;
    }

    if (error) {
      return <div style={{ padding: '1rem', color: 'red' }}>Error: {error}</div>;
    }

    return (
      <div
        style={{ width: width, height: height, overflow: 'hidden' }}
        ref={mount => {
          this.mount = mount;
        }}
      />
    );
  }
}

export default Projection
