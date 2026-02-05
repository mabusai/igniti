import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { getProjectById } from '../../lib/projectStore'
import styles from '../../styles/Project.module.css'

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Failed to read file.'))
    reader.readAsDataURL(file)
  })
}

export default function ProjectPage({ initialProject }) {
  const [project, setProject] = useState(initialProject)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

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
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed.')
      }

      setProject(data.project)
    } catch (uploadError) {
      setError(uploadError.message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <div className={styles.page}>
      <Head>
        <title>{project.name}</title>
        <script
          type="module"
          src="https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js"
        />
      </Head>

      <main className={styles.main}>
        <div className={styles.header}>
          <h1>{project.name}</h1>
          <p className={styles.id}>{project.id}</p>
          <Link href="/" className={styles.backLink}>
            ホームへ戻る
          </Link>
        </div>

        {project.model ? (
          <section className={styles.viewerSection}>
            <model-viewer
              src={project.model.publicPath}
              camera-controls
              auto-rotate
              ar
              shadow-intensity="1"
              className={styles.viewer}
            />
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
