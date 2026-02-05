import { mkdir, readFile, writeFile } from 'fs/promises'
import path from 'path'
import { randomUUID } from 'crypto'

const DATA_DIR = path.join(process.cwd(), 'data')
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json')
const PUBLIC_PROJECTS_DIR = path.join(process.cwd(), 'public', 'projects')
const SUPPORTED_MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.usdz'])

async function ensureStorage() {
  await mkdir(DATA_DIR, { recursive: true })
  await mkdir(PUBLIC_PROJECTS_DIR, { recursive: true })

  try {
    await readFile(PROJECTS_FILE, 'utf8')
  } catch {
    await writeFile(PROJECTS_FILE, '[]', 'utf8')
  }
}

async function readProjects() {
  await ensureStorage()
  const raw = await readFile(PROJECTS_FILE, 'utf8')
  return JSON.parse(raw)
}

async function writeProjects(projects) {
  await ensureStorage()
  await writeFile(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8')
}

export async function listProjects() {
  const projects = await readProjects()
  return projects.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

export async function createProject(name) {
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  if (!normalizedName) {
    throw new Error('Project name is required.')
  }

  const project = {
    id: randomUUID(),
    name: normalizedName,
    createdAt: new Date().toISOString(),
    model: null,
  }

  const projects = await readProjects()
  projects.unshift(project)
  await writeProjects(projects)
  await mkdir(path.join(PUBLIC_PROJECTS_DIR, project.id), { recursive: true })

  return project
}

export async function getProjectById(id) {
  const projects = await readProjects()
  return projects.find((project) => project.id === id) || null
}

export async function saveProjectModel(projectId, originalFileName, contentBuffer) {
  const projects = await readProjects()
  const index = projects.findIndex((project) => project.id === projectId)

  if (index < 0) {
    throw new Error('Project not found.')
  }

  const extension = path.extname(originalFileName || '').toLowerCase()
  if (!SUPPORTED_MODEL_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported model format. Use .glb, .gltf, or .usdz.')
  }

  const fileName = `model${extension}`
  const projectDir = path.join(PUBLIC_PROJECTS_DIR, projectId)
  await mkdir(projectDir, { recursive: true })
  await writeFile(path.join(projectDir, fileName), contentBuffer)

  projects[index] = {
    ...projects[index],
    model: {
      fileName,
      publicPath: `/projects/${projectId}/${fileName}`,
      uploadedAt: new Date().toISOString(),
    },
  }

  await writeProjects(projects)
  return projects[index]
}
