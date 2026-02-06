import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { getProjectById } from '../../lib/projectStore'
import styles from '../../styles/Project.module.css'

const ModelSceneViewer = dynamic(() => import('../../components/ModelSceneViewer'), {
  ssr: false,
})

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.readAsDataURL(file)
  })
}

function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read JSON file.'))
    reader.readAsText(file)
  })
}

function round3(value) {
  return Math.round(value * 1000) / 1000
}

function createId() {
  if (
    typeof globalThis !== 'undefined' &&
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID()
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function readApiResult(response) {
  const raw = await response.text()
  try {
    return { data: JSON.parse(raw), raw }
  } catch {
    return { data: null, raw }
  }
}

function createDraftFire() {
  return {
    name: 'Fire',
    x: 0,
    y: 0,
    z: 0,
    scale: 1,
  }
}

function createDraftCamera() {
  return {
    name: 'Camera',
    x: 0,
    y: 2,
    z: 0,
    yaw: 0,
    pitch: -20,
  }
}

export default function ProjectPage({ initialProject }) {
  const [project, setProject] = useState(initialProject)
  const [modelUrl, setModelUrl] = useState(initialProject.model?.signedUrl || '')
  const [fires, setFires] = useState(Array.isArray(initialProject.fires) ? initialProject.fires : [])
  const [cameras, setCameras] = useState(
    Array.isArray(initialProject.cameras) ? initialProject.cameras : []
  )
  const [draftFire, setDraftFire] = useState(null)
  const [draftCamera, setDraftCamera] = useState(null)
  const [editingCameraId, setEditingCameraId] = useState(null)
  const [cameraDragMode, setCameraDragMode] = useState('translate')
  const [activeCameraId, setActiveCameraId] = useState(null)
  const [cameraFocusTick, setCameraFocusTick] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [savingScene, setSavingScene] = useState(false)
  const [error, setError] = useState('')
  const [jsonMessage, setJsonMessage] = useState('')
  const jsonInputRef = useRef(null)
  const refreshTimerRef = useRef(null)

  async function handleUpload(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setUploading(true)
    setError('')

    try {
      const fileData = await fileToDataUrl(file)
      const response = await fetch(`/api/projects/${project.id}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName: file.name, fileData }),
      })
      const { data, raw } = await readApiResult(response)

      if (!response.ok) {
        if (raw?.startsWith('Body exceeded')) {
          throw new Error('アップロードサイズが上限を超えています。ファイルを小さくしてください。')
        }
        throw new Error(data?.error || raw || 'Upload failed.')
      }

      setProject(data.project)
      setModelUrl(data.project?.model?.signedUrl || '')
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  async function refreshSignedUrl() {
    if (!project?.id) {
      return
    }
    try {
      const response = await fetch(`/api/projects/${project.id}/model-url`)
      const { data, raw } = await readApiResult(response)
      if (!response.ok) {
        throw new Error(data?.error || raw || 'Failed to refresh model URL.')
      }
      setModelUrl(data.signedUrl || '')
    } catch (refreshError) {
      setError(refreshError.message)
    }
  }

  useEffect(() => {
    if (!project?.model?.storagePath || !modelUrl) {
      return undefined
    }

    const ttl = Number(process.env.NEXT_PUBLIC_SIGNED_URL_TTL || 3600)
    const refreshMs = Math.max(60000, (ttl - 300) * 1000)

    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
    }

    refreshTimerRef.current = setTimeout(() => {
      refreshSignedUrl()
    }, refreshMs)

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [modelUrl, project?.model?.storagePath])

  useEffect(() => {
    setModelUrl(project?.model?.signedUrl || '')
  }, [project?.model?.signedUrl])

  function handleExportJson() {
    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        id: project.id,
        name: project.name,
        model: project.model,
        fires,
        cameras,
        triggers: Array.isArray(project.triggers) ? project.triggers : [],
      },
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.id}.json`
    link.click()
    URL.revokeObjectURL(url)
    setJsonMessage('JSONを保存しました。')
  }

  async function handleImportJson(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setError('')
    setJsonMessage('')

    try {
      const text = await readTextFile(file)
      const parsed = JSON.parse(text)
      const payload = parsed?.project || parsed

      if (!payload || typeof payload !== 'object') {
        throw new Error('JSONフォーマットが不正です。')
      }

      setProject((prev) => ({
        ...prev,
        name: typeof payload.name === 'string' && payload.name.trim() ? payload.name : prev.name,
        triggers: Array.isArray(payload.triggers) ? payload.triggers : prev.triggers,
      }))
      const nextFires = Array.isArray(payload.fires) ? payload.fires : []
      const nextCameras = Array.isArray(payload.cameras) ? payload.cameras : []
      setFires(nextFires)
      setCameras(nextCameras)
      await persistScene(nextFires, nextCameras)
      setJsonMessage('JSONを読み込みました。')
    } catch (importError) {
      setError(importError.message)
    } finally {
      event.target.value = ''
    }
  }

  function updateDraftField(field, value) {
    if (field === 'y') {
      setDraftFire((prev) => ({ ...(prev || createDraftFire()), y: Math.max(0, value) }))
      return
    }
    setDraftFire((prev) => ({ ...(prev || createDraftFire()), [field]: value }))
  }

  async function persistScene(nextFires, nextCameras) {
    setSavingScene(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/scene`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fires: nextFires, cameras: nextCameras }),
      })
      const { data, raw } = await readApiResult(response)

      if (!response.ok) {
        throw new Error(data?.error || raw || 'Failed to save scene.')
      }

      if (data?.project) {
        setProject((prev) => ({
          ...prev,
          fires: Array.isArray(data.project.fires) ? data.project.fires : prev.fires,
          cameras: Array.isArray(data.project.cameras) ? data.project.cameras : prev.cameras,
        }))
      }
    } finally {
      setSavingScene(false)
    }
  }

  function handleDraftMove(next) {
    setDraftFire((prev) => (prev ? { ...prev, ...next } : prev))
  }

  function nudgeCameraAxis(axis, delta) {
    setDraftCamera((prev) => {
      if (!prev) {
        return prev
      }
      if (axis === 'y') {
        return { ...prev, y: round3(Math.max(0, prev.y + delta)) }
      }
      return { ...prev, [axis]: round3(prev[axis] + delta) }
    })
  }

  function handleDraftCameraChange(next) {
    setDraftCamera((prev) => (prev ? { ...prev, ...next } : prev))
  }

  function startAddFire() {
    setDraftFire(createDraftFire())
    setJsonMessage('発火点のドラフトを表示しました。')
  }

  function startAddCamera() {
    setDraftCamera(createDraftCamera())
    setEditingCameraId(null)
    setJsonMessage('カメラのドラフトを表示しました。')
  }

  function handleSaveFire() {
    if (!draftFire) {
      return
    }
    const fire = {
      id: createId(),
      name: draftFire.name.trim() || `Fire ${fires.length + 1}`,
      x: round3(draftFire.x),
      y: round3(Math.max(0, draftFire.y)),
      z: round3(draftFire.z),
      scale: round3(draftFire.scale),
      createdAt: new Date().toISOString(),
    }
    const nextFires = [...fires, fire]
    setFires(nextFires)
    setDraftFire(null)
    setJsonMessage('火をリストに追加しました。')
    persistScene(nextFires, cameras).catch((saveError) => setError(saveError.message))
  }

  function loadFireToEditor(fire) {
    setDraftFire({
      name: fire.name || 'Fire',
      x: Number(fire.x) || 0,
      y: Math.max(0, Number(fire.y) || 0),
      z: Number(fire.z) || 0,
      scale: Number(fire.scale) || 1,
    })
    setJsonMessage('火の位置をエディタに読み込みました。')
  }

  function removeFire(id) {
    const nextFires = fires.filter((fire) => fire.id !== id)
    setFires(nextFires)
    persistScene(nextFires, cameras).catch((saveError) => setError(saveError.message))
  }

  function handleSaveCamera() {
    if (!draftCamera) {
      return
    }
    const cameraId = editingCameraId || createId()
    const camera = {
      id: cameraId,
      name: draftCamera.name.trim() || `Camera ${cameras.length + 1}`,
      x: round3(draftCamera.x),
      y: round3(Math.max(0, draftCamera.y)),
      z: round3(draftCamera.z),
      yaw: round3(draftCamera.yaw),
      pitch: round3(draftCamera.pitch),
      createdAt: new Date().toISOString(),
    }
    const nextCameras = !editingCameraId
      ? [...cameras, camera]
      : cameras.map((item) => (item.id === editingCameraId ? { ...item, ...camera } : item))
    setCameras(nextCameras)
    setDraftCamera(null)
    setEditingCameraId(null)
    setJsonMessage(editingCameraId ? '防犯カメラ視点を更新しました。' : '防犯カメラ視点をリストに追加しました。')
    persistScene(fires, nextCameras).catch((saveError) => setError(saveError.message))
  }

  function loadCameraToEditor(cameraItem) {
    setEditingCameraId(cameraItem.id)
    setDraftCamera({
      name: cameraItem.name || 'Camera',
      x: Number(cameraItem.x) || 0,
      y: Math.max(0, Number(cameraItem.y) || 0),
      z: Number(cameraItem.z) || 0,
      yaw: Number(cameraItem.yaw) || 0,
      pitch: Number(cameraItem.pitch) || 0,
    })
    setJsonMessage('カメラ視点をエディタに読み込みました。')
  }

  function removeCamera(id) {
    const nextCameras = cameras.filter((cameraItem) => cameraItem.id !== id)
    setCameras(nextCameras)
    if (editingCameraId === id) {
      setEditingCameraId(null)
      setDraftCamera(null)
    }
    persistScene(fires, nextCameras).catch((saveError) => setError(saveError.message))
  }

  return (
    <div className={styles.page}>
      <Head>
        <title>{project.name}</title>
      </Head>

      <main className={styles.main}>
        <div className={styles.header}>
          <h1>{project.name}</h1>
          <p className={styles.id}>{project.id}</p>
          <Link href="/" className={styles.backLink}>
            ホームへ戻る
          </Link>
        </div>

        {modelUrl ? (
          <section className={styles.viewerSection}>
            <div className={styles.viewerWrap}>
              <div className={styles.viewer}>
                <ModelSceneViewer
                  modelPath={modelUrl}
                  fires={fires}
                  draftFire={draftFire}
                  cameras={cameras.filter((cameraItem) => cameraItem.id !== editingCameraId)}
                  draftCamera={draftCamera}
                  activeCameraId={activeCameraId}
                  cameraFocusTick={cameraFocusTick}
                  onDraftMove={handleDraftMove}
                  onDraftCameraChange={handleDraftCameraChange}
                  onCameraDragModeChange={setCameraDragMode}
                />
              </div>
              <div className={styles.sidePanel}>
                <div className={styles.actions}>
                  <button type="button" onClick={startAddFire} className={styles.button}>
                    発火点追加
                  </button>
                  <button type="button" onClick={startAddCamera} className={styles.button}>
                    カメラ追加
                  </button>
                </div>

                {draftFire ? (
                  <div className={styles.heightControl}>
                    <span>発火点: {draftFire.name}</span>
                    <input
                      type="range"
                      min="0"
                      max="5"
                      step="0.01"
                      value={draftFire.y}
                      onChange={(event) => updateDraftField('y', Number(event.target.value))}
                      className={styles.verticalSlider}
                    />
                    <span>{draftFire.y}</span>
                    <button type="button" onClick={handleSaveFire} className={styles.button}>
                      保存
                    </button>
                  </div>
                ) : null}

                {draftCamera ? (
                  <div className={styles.sideListBlock}>
                    <p className={styles.sideTitle}>
                      カメラ編集中（{cameraDragMode === 'translate' ? '平行移動' : '回転'}）
                    </p>
                    <p className={styles.positionText}>
                      位置: X {draftCamera.x} / Y {draftCamera.y} / Z {draftCamera.z}
                    </p>
                    <p className={styles.positionText}>
                      向き: Yaw {draftCamera.yaw}° / Pitch {draftCamera.pitch}°
                    </p>
                    <div className={styles.actions}>
                      <button type="button" onClick={() => nudgeCameraAxis('y', 0.1)} className={styles.button}>
                        Y+
                      </button>
                      <button type="button" onClick={handleSaveCamera} className={styles.button}>
                        保存
                      </button>
                    </div>
                  </div>
                ) : null}

                <section className={styles.sideListBlock}>
                  <p className={styles.sideTitle}>発火点リスト</p>
                  {fires.length > 0 ? (
                    <ul className={styles.fireList}>
                      {fires.map((fire, index) => (
                        <li key={fire.id} className={styles.fireItem}>
                          <span>
                            {index + 1}. {fire.name} ({fire.x}, {fire.y}, {fire.z})
                          </span>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              onClick={() => loadFireToEditor(fire)}
                              className={styles.button}
                            >
                              編集
                            </button>
                            <button type="button" onClick={() => removeFire(fire.id)} className={styles.button}>
                              削除
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>まだ発火点はありません。</p>
                  )}
                </section>

                <section className={styles.sideListBlock}>
                  <p className={styles.sideTitle}>カメラリスト</p>
                  {cameras.length > 0 ? (
                    <ul className={styles.fireList}>
                      {cameras.map((cameraItem, index) => (
                        <li key={cameraItem.id} className={styles.fireItem}>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveCameraId(cameraItem.id)
                              setCameraFocusTick((prev) => prev + 1)
                            }}
                            className={styles.itemLink}
                          >
                            {index + 1}. {cameraItem.name} ({cameraItem.x}, {cameraItem.y},{' '}
                            {cameraItem.z}) / Yaw {cameraItem.yaw} / Pitch {cameraItem.pitch}
                          </button>
                          <div className={styles.actions}>
                            <button
                              type="button"
                              onClick={() => loadCameraToEditor(cameraItem)}
                              className={styles.button}
                            >
                              編集
                            </button>
                            <button type="button" onClick={() => removeCamera(cameraItem.id)} className={styles.button}>
                              削除
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>まだカメラはありません。</p>
                  )}
                </section>
              </div>
            </div>
          </section>
        ) : (
          <section className={styles.uploadSection}>
            <p>3Dモデルがありません。アップロードしてください。</p>
          </section>
        )}

        <section className={styles.uploadSection}>
          <label htmlFor="model-upload" className={styles.uploadLabel}>
            {uploading ? 'アップロード中...' : '3Dモデルをアップロード (.glb / .gltf / .usdz)'}
          </label>
          <input
            id="model-upload"
            type="file"
            accept=".glb,.gltf,.usdz"
            onChange={handleUpload}
            disabled={uploading}
            className={styles.input}
          />
          {error ? <p className={styles.error}>{error}</p> : null}
          {savingScene ? <p className={styles.positionText}>シーン保存中...</p> : null}
        </section>

        <section className={styles.uploadSection}>
          <p className={styles.uploadLabel}>JSONの保存 / 読み込み</p>
          <div className={styles.actions}>
            <button type="button" onClick={handleExportJson} className={styles.button}>
              JSONを保存
            </button>
            <button
              type="button"
              onClick={() => jsonInputRef.current?.click()}
              className={styles.button}
            >
              JSONを読み込み
            </button>
          </div>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImportJson}
            className={styles.hiddenInput}
          />
          {jsonMessage ? <p className={styles.success}>{jsonMessage}</p> : null}
        </section>
      </main>
    </div>
  )
}

export async function getServerSideProps({ params }) {
  const project = await getProjectById(params.id)

  if (!project) {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      initialProject: project,
    },
  }
}
