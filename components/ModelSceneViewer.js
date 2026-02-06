import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

const FIRE_BASE_SCALE = 0.5

function createCctvMesh() {
  const root = new THREE.Group()

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, 0.26, 12),
    new THREE.MeshStandardMaterial({ color: '#64748b', metalness: 0.6, roughness: 0.3 })
  )
  pole.position.y = 0.13
  root.add(pole)

  const headPivot = new THREE.Group()
  headPivot.position.y = 0.26
  root.add(headPivot)

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.1, 0.36),
    new THREE.MeshStandardMaterial({ color: '#e2e8f0', metalness: 0.25, roughness: 0.45 })
  )
  head.position.z = 0.17
  headPivot.add(head)

  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, 0.2, 16),
    new THREE.MeshStandardMaterial({ color: '#0f172a', metalness: 0.5, roughness: 0.2 })
  )
  lens.rotation.x = Math.PI / 2
  lens.position.z = 0.42
  headPivot.add(lens)

  const viewCone = new THREE.Mesh(
    new THREE.ConeGeometry(0.2, 0.7, 20, 1, true),
    new THREE.MeshBasicMaterial({
      color: '#f59e0b',
      transparent: true,
      opacity: 0.18,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  )
  viewCone.rotation.x = Math.PI / 2
  viewCone.position.z = 0.78
  headPivot.add(viewCone)

  return { root, headPivot }
}

function clearGroup(group) {
  group.children.slice().forEach((child) => {
    if (child.geometry) {
      child.geometry.dispose()
    }
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose())
    } else if (child.material) {
      child.material.dispose()
    }
    group.remove(child)
  })
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

export default function ModelSceneViewer({
  modelPath,
  fires = [],
  draftFire,
  cameras = [],
  draftCamera,
  activeCameraId,
  cameraFocusTick,
  onDraftMove,
  onDraftCameraChange,
  onCameraDragModeChange,
}) {
  const canvasWrapRef = useRef(null)
  const fireTemplateRef = useRef(null)
  const fireMinYRef = useRef(0)
  const fireGroupRef = useRef(null)
  const cameraGroupRef = useRef(null)
  const draftFireMeshRef = useRef(null)
  const draftCameraMeshRef = useRef(null)
  const draftCameraHeadRef = useRef(null)
  const cameraDragModeRef = useRef('translate')
  const firesRef = useRef(fires)
  const camerasRef = useRef(cameras)
  const draftFireDataRef = useRef(draftFire)
  const draftCameraDataRef = useRef(draftCamera)
  const onDraftMoveRef = useRef(onDraftMove)
  const onDraftCameraChangeRef = useRef(onDraftCameraChange)
  const onCameraDragModeChangeRef = useRef(onCameraDragModeChange)
  const sceneCameraRef = useRef(null)
  const controlsRef = useRef(null)

  firesRef.current = fires
  camerasRef.current = cameras
  draftFireDataRef.current = draftFire
  draftCameraDataRef.current = draftCamera
  onDraftMoveRef.current = onDraftMove
  onDraftCameraChangeRef.current = onDraftCameraChange
  onCameraDragModeChangeRef.current = onCameraDragModeChange

  function renderFires() {
    const fireGroup = fireGroupRef.current
    const fireTemplate = fireTemplateRef.current
    if (!fireGroup || !fireTemplate) {
      return
    }

    clearGroup(fireGroup)
    firesRef.current.forEach((fire) => {
      const fireClone = fireTemplate.clone(true)
      const scale = (Number(fire.scale) || 1) * FIRE_BASE_SCALE
      const yOffset = -fireMinYRef.current * scale
      fireClone.position.set(
        Number(fire.x) || 0,
        (Number(fire.y) || 0) + yOffset,
        Number(fire.z) || 0
      )
      fireClone.scale.set(scale, scale, scale)
      fireGroup.add(fireClone)
    })
  }

  function renderCameras() {
    const cameraGroup = cameraGroupRef.current
    if (!cameraGroup) {
      return
    }
    clearGroup(cameraGroup)
    camerasRef.current.forEach((cameraItem) => {
      const { root, headPivot } = createCctvMesh()
      root.position.set(
        Number(cameraItem.x) || 0,
        Number(cameraItem.y) || 0,
        Number(cameraItem.z) || 0
      )
      root.rotation.y = THREE.MathUtils.degToRad(Number(cameraItem.yaw) || 0)
      headPivot.rotation.x = THREE.MathUtils.degToRad(Number(cameraItem.pitch) || 0)
      cameraGroup.add(root)
    })
  }

  useEffect(() => {
    if (!canvasWrapRef.current || !modelPath) {
      return undefined
    }

    onCameraDragModeChangeRef.current?.(cameraDragModeRef.current)

    const host = canvasWrapRef.current
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(host.clientWidth, host.clientHeight)
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#dbeafe')

    const camera = new THREE.PerspectiveCamera(50, host.clientWidth / host.clientHeight, 0.1, 1000)
    camera.position.set(2.8, 2.2, 4)
    sceneCameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.target.set(0, 1, 0)
    controlsRef.current = controls

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.2)
    scene.add(hemiLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.1)
    dirLight.position.set(4, 8, 4)
    scene.add(dirLight)

    const grid = new THREE.GridHelper(30, 30, 0x64748b, 0xcbd5e1)
    scene.add(grid)
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.MeshStandardMaterial({ color: '#9ca3af', roughness: 0.95, metalness: 0.05 })
    )
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.001
    scene.add(ground)

    const loader = new GLTFLoader()

    loader.load(modelPath, (gltf) => {
      gltf.scene.rotation.x = -Math.PI / 2
      gltf.scene.updateMatrixWorld(true)
      scene.add(gltf.scene)
    })

    const fireGroup = new THREE.Group()
    scene.add(fireGroup)
    fireGroupRef.current = fireGroup
    const cameraGroup = new THREE.Group()
    scene.add(cameraGroup)
    cameraGroupRef.current = cameraGroup

    const draftCamera = createCctvMesh()
    scene.add(draftCamera.root)
    draftCameraMeshRef.current = draftCamera.root
    draftCameraHeadRef.current = draftCamera.headPivot
    draftCamera.root.visible = false
    renderCameras()

    loader.load('/fire.glb', (gltf) => {
      const fireBox = new THREE.Box3().setFromObject(gltf.scene)
      fireMinYRef.current = fireBox.min.y
      fireTemplateRef.current = gltf.scene
      const draft = gltf.scene.clone(true)
      scene.add(draft)
      draftFireMeshRef.current = draft
      draft.visible = false
      renderFires()
    })

    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    const hitPoint = new THREE.Vector3()
    const dragOffset = new THREE.Vector3()
    const dragState = {
      target: null,
      isDragging: false,
      moved: false,
      startClientX: 0,
      startClientY: 0,
      startYaw: 0,
      startPitch: 0,
    }

    const setPointer = (event) => {
      const rect = renderer.domElement.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    }

    const handlePointerDown = (event) => {
      setPointer(event)
      raycaster.setFromCamera(pointer, camera)
      const draftFire = draftFireMeshRef.current
      const draftCameraMesh = draftCameraMeshRef.current

      if (draftCameraMesh && draftCameraDataRef.current && draftCameraMesh.visible) {
        const cameraIntersects = raycaster.intersectObject(draftCameraMesh, true)
        if (cameraIntersects.length > 0) {
          dragState.target = 'camera'
          dragState.isDragging = true
          dragState.moved = false
          dragState.startClientX = event.clientX
          dragState.startClientY = event.clientY
          dragState.startYaw = Number(draftCameraDataRef.current.yaw) || 0
          dragState.startPitch = Number(draftCameraDataRef.current.pitch) || 0
          controls.enabled = false
          renderer.domElement.style.cursor = 'grabbing'
          if (cameraDragModeRef.current === 'translate') {
            const currentY = Number(draftCameraDataRef.current.y) || 0
            dragPlane.set(new THREE.Vector3(0, 1, 0), -currentY)
            if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
              dragOffset.copy(draftCameraMesh.position).sub(hitPoint)
            }
          }
          return
        }
      }

      if (!draftFire || !draftFireDataRef.current || !draftFire.visible) {
        return
      }
      const fireIntersects = raycaster.intersectObject(draftFire, true)
      if (fireIntersects.length === 0) {
        return
      }

      dragState.target = 'fire'
      dragState.isDragging = true
      dragState.moved = false
      controls.enabled = false
      renderer.domElement.style.cursor = 'grabbing'
      const currentY = Number(draftFireDataRef.current.y) || 0
      const draftScale = (Number(draftFireDataRef.current.scale) || 1) * FIRE_BASE_SCALE
      const yOffset = -fireMinYRef.current * draftScale
      dragPlane.set(new THREE.Vector3(0, 1, 0), -(currentY + yOffset))
      if (raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
        dragOffset.copy(draftFire.position).sub(hitPoint)
      }
    }

    const handlePointerMove = (event) => {
      if (!dragState.isDragging || !dragState.target) {
        return
      }
      const movedX = Math.abs(event.clientX - dragState.startClientX)
      const movedY = Math.abs(event.clientY - dragState.startClientY)
      if (movedX > 2 || movedY > 2) {
        dragState.moved = true
      }

      setPointer(event)
      raycaster.setFromCamera(pointer, camera)

      if (dragState.target === 'fire') {
        const draftMesh = draftFireMeshRef.current
        if (!draftMesh) {
          return
        }
        const currentY = Number(draftFireDataRef.current?.y) || 0
        const draftScale = (Number(draftFireDataRef.current?.scale) || 1) * FIRE_BASE_SCALE
        const yOffset = -fireMinYRef.current * draftScale
        dragPlane.set(new THREE.Vector3(0, 1, 0), -(currentY + yOffset))
        if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
          return
        }

        const x = hitPoint.x + dragOffset.x
        const z = hitPoint.z + dragOffset.z
        draftMesh.position.set(x, currentY, z)
        onDraftMoveRef.current?.({ x: round3(x), z: round3(z) })
        return
      }

      if (dragState.target === 'camera') {
        const draftMesh = draftCameraMeshRef.current
        if (!draftMesh) {
          return
        }

        if (cameraDragModeRef.current === 'translate') {
          const currentY = Number(draftCameraDataRef.current?.y) || 0
          dragPlane.set(new THREE.Vector3(0, 1, 0), -currentY)
          if (!raycaster.ray.intersectPlane(dragPlane, hitPoint)) {
            return
          }
          const x = hitPoint.x + dragOffset.x
          const z = hitPoint.z + dragOffset.z
          draftMesh.position.set(x, currentY, z)
          onDraftCameraChangeRef.current?.({ x: round3(x), z: round3(z) })
          return
        }

        const dx = event.clientX - dragState.startClientX
        const dy = event.clientY - dragState.startClientY
        const yaw = dragState.startYaw + dx * 0.25
        const pitch = Math.max(-85, Math.min(85, dragState.startPitch - dy * 0.25))
        draftMesh.rotation.y = THREE.MathUtils.degToRad(yaw)
        if (draftCameraHeadRef.current) {
          draftCameraHeadRef.current.rotation.x = THREE.MathUtils.degToRad(pitch)
        }
        onDraftCameraChangeRef.current?.({ yaw: round3(yaw), pitch: round3(pitch) })
      }
    }

    const handlePointerUp = () => {
      if (!dragState.isDragging) {
        return
      }
      if (dragState.target === 'camera' && !dragState.moved) {
        cameraDragModeRef.current =
          cameraDragModeRef.current === 'translate' ? 'rotate' : 'translate'
        onCameraDragModeChangeRef.current?.(cameraDragModeRef.current)
      }
      dragState.target = null
      dragState.isDragging = false
      dragState.moved = false
      controls.enabled = true
      renderer.domElement.style.cursor = 'grab'
    }

    renderer.domElement.style.cursor = 'grab'
    renderer.domElement.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    const handleResize = () => {
      if (!canvasWrapRef.current) {
        return
      }
      const width = canvasWrapRef.current.clientWidth
      const height = canvasWrapRef.current.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', handleResize)

    let frameId = 0
    const lookTarget = new THREE.Vector3()
    const tick = () => {
      controls.update()
      fireGroup.children.forEach((fireModel) => {
        lookTarget.set(camera.position.x, fireModel.position.y, camera.position.z)
        fireModel.lookAt(lookTarget)
      })
      if (draftFireMeshRef.current) {
        lookTarget.set(
          camera.position.x,
          draftFireMeshRef.current.position.y,
          camera.position.z
        )
        draftFireMeshRef.current.lookAt(lookTarget)
      }
      renderer.render(scene, camera)
      frameId = window.requestAnimationFrame(tick)
    }
    tick()

    return () => {
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.cancelAnimationFrame(frameId)
      controls.dispose()
      renderer.dispose()
      host.removeChild(renderer.domElement)
      fireTemplateRef.current = null
      fireGroupRef.current = null
      cameraGroupRef.current = null
      draftFireMeshRef.current = null
      draftCameraMeshRef.current = null
      draftCameraHeadRef.current = null
      sceneCameraRef.current = null
      controlsRef.current = null
    }
  }, [modelPath])

  useEffect(() => {
    renderFires()
  }, [fires])

  useEffect(() => {
    renderCameras()
  }, [cameras])

  useEffect(() => {
    if (!draftFireMeshRef.current) {
      return
    }
    if (!draftFire) {
      draftFireMeshRef.current.visible = false
      return
    }
    draftFireMeshRef.current.visible = true
    const scale = (Number(draftFire.scale) || 1) * FIRE_BASE_SCALE
    const yOffset = -fireMinYRef.current * scale
    draftFireMeshRef.current.position.set(
      Number(draftFire.x) || 0,
      (Number(draftFire.y) || 0) + yOffset,
      Number(draftFire.z) || 0
    )
    draftFireMeshRef.current.scale.set(scale, scale, scale)
  }, [draftFire])

  useEffect(() => {
    if (!draftCameraMeshRef.current || !draftCameraHeadRef.current) {
      return
    }
    if (!draftCamera) {
      draftCameraMeshRef.current.visible = false
      return
    }
    draftCameraMeshRef.current.visible = true
    draftCameraMeshRef.current.position.set(
      Number(draftCamera.x) || 0,
      Number(draftCamera.y) || 0,
      Number(draftCamera.z) || 0
    )
    draftCameraMeshRef.current.rotation.y = THREE.MathUtils.degToRad(Number(draftCamera.yaw) || 0)
    draftCameraHeadRef.current.rotation.x = THREE.MathUtils.degToRad(Number(draftCamera.pitch) || 0)
  }, [draftCamera])

  useEffect(() => {
    if (!activeCameraId || !sceneCameraRef.current || !controlsRef.current) {
      return
    }

    const cameraItem = cameras.find((item) => item.id === activeCameraId)
    if (!cameraItem) {
      return
    }

    const yaw = THREE.MathUtils.degToRad(Number(cameraItem.yaw) || 0)
    const pitch = THREE.MathUtils.degToRad(Number(cameraItem.pitch) || 0)
    const orientation = new THREE.Euler(pitch, yaw, 0, 'YXZ')
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(orientation).normalize()
    const basePos = new THREE.Vector3(
      Number(cameraItem.x) || 0,
      Number(cameraItem.y) || 0,
      Number(cameraItem.z) || 0
    )
    const eye = basePos.clone().add(new THREE.Vector3(0, 0.26, 0)).add(forward.clone().multiplyScalar(0.42))
    const target = eye.clone().add(forward.multiplyScalar(3))

    sceneCameraRef.current.position.copy(eye)
    controlsRef.current.target.copy(target)
    controlsRef.current.update()
  }, [activeCameraId, cameraFocusTick, cameras])

  return <div ref={canvasWrapRef} style={{ width: '100%', height: '100%' }} />
}
