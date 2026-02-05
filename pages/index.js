import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import styles from '../styles/Home.module.css'

export default function Home() {
  const [projects, setProjects] = useState([])
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function fetchProjects() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/projects')
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to load projects.')
      }

      setProjects(data.projects || [])
    } catch (fetchError) {
      setError(fetchError.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  async function handleCreateProject(event) {
    event.preventDefault()

    if (!name.trim()) {
      setError('プロジェクト名を入力してください。')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create project.')
      }

      setProjects((prev) => [data.project, ...prev])
      setName('')
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.page}>
      <Head>
        <title>Project Home</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <section className={styles.card}>
          <h1>プロジェクト一覧</h1>
          <form className={styles.form} onSubmit={handleCreateProject}>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="新規プロジェクト名"
              className={styles.input}
            />
            <button type="submit" className={styles.button} disabled={submitting}>
              {submitting ? '作成中...' : 'プロジェクト作成'}
            </button>
          </form>

          {error ? <p className={styles.error}>{error}</p> : null}

          {loading ? (
            <p>読み込み中...</p>
          ) : projects.length === 0 ? (
            <p>まだプロジェクトがありません。</p>
          ) : (
            <ul className={styles.list}>
              {projects.map((project) => (
                <li key={project.id} className={styles.item}>
                  <Link href={`/projects/${project.id}`} className={styles.link}>
                    <span className={styles.projectName}>{project.name}</span>
                    <span className={styles.projectMeta}>
                      {project.model ? '3Dモデルあり' : '3Dモデルなし'}
                    </span>
                    <span className={styles.projectId}>{project.id}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
