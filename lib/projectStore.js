import path from 'path'
import { randomUUID } from 'crypto'
import { getSupabaseAdmin } from './supabaseAdmin'

const SUPPORTED_MODEL_EXTENSIONS = new Set(['.glb', '.gltf', '.usdz'])
const PROJECTS_TABLE = 'projects'
const MODELS_BUCKET = process.env.SUPABASE_MODELS_BUCKET || 'project-models'
const SIGNED_URL_TTL = Number(process.env.SUPABASE_SIGNED_URL_TTL || 3600)

function mapRowToProject(row) {
  if (!row) {
    return null
  }
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    model: row.model || null,
    fires: Array.isArray(row.fires) ? row.fires : [],
    cameras: Array.isArray(row.cameras) ? row.cameras : [],
  }
}

async function attachSignedModelUrl(project) {
  if (!project?.model?.storagePath) {
    return project
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage
    .from(MODELS_BUCKET)
    .createSignedUrl(project.model.storagePath, SIGNED_URL_TTL)

  if (error) {
    if (error.message && error.message.toLowerCase().includes('object not found')) {
      return {
        ...project,
        model: {
          ...project.model,
          signedUrl: null,
          missing: true,
        },
      }
    }
    throw new Error(error.message)
  }

  return {
    ...project,
    model: {
      ...project.model,
      signedUrl: data.signedUrl,
    },
  }
}

export async function getSignedModelUrl(projectId) {
  const project = await getProjectById(projectId)
  if (!project?.model?.storagePath) {
    return null
  }

  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase.storage
    .from(MODELS_BUCKET)
    .createSignedUrl(project.model.storagePath, SIGNED_URL_TTL)

  if (error) {
    if (error.message && error.message.toLowerCase().includes('object not found')) {
      return null
    }
    throw new Error(error.message)
  }

  return data.signedUrl
}

export async function listProjects() {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []).map(mapRowToProject)
}

export async function createProject(name) {
  const normalizedName = typeof name === 'string' ? name.trim() : ''
  if (!normalizedName) {
    throw new Error('Project name is required.')
  }

  const supabase = getSupabaseAdmin()
  const id = randomUUID()

  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .insert({
      id,
      name: normalizedName,
      model: null,
      fires: [],
      cameras: [],
    })
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return mapRowToProject(data)
}

export async function getProjectById(id) {
  const supabase = getSupabaseAdmin()
  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  const project = mapRowToProject(data)
  return attachSignedModelUrl(project)
}

export async function saveProjectModel(projectId, originalFileName, contentBuffer) {
  const supabase = getSupabaseAdmin()
  const project = await getProjectById(projectId)
  if (!project) {
    throw new Error('Project not found.')
  }

  const extension = path.extname(originalFileName || '').toLowerCase()
  if (!SUPPORTED_MODEL_EXTENSIONS.has(extension)) {
    throw new Error('Unsupported model format. Use .glb, .gltf, or .usdz.')
  }

  const fileName = `model${extension}`
  const storagePath = `${projectId}/${fileName}`
  const contentType =
    extension === '.glb' ? 'model/gltf-binary' : extension === '.gltf' ? 'model/gltf+json' : 'model/vnd.usdz+zip'

  const { error: uploadError } = await supabase.storage
    .from(MODELS_BUCKET)
    .upload(storagePath, contentBuffer, {
      upsert: true,
      contentType,
    })

  if (uploadError) {
    throw new Error(uploadError.message)
  }

  const model = {
    fileName,
    storagePath,
    uploadedAt: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .update({ model })
    .eq('id', projectId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const updated = mapRowToProject(data)
  return attachSignedModelUrl(updated)
}

export async function saveProjectScene(projectId, scene) {
  const supabase = getSupabaseAdmin()
  const payload = {
    fires: Array.isArray(scene?.fires) ? scene.fires : [],
    cameras: Array.isArray(scene?.cameras) ? scene.cameras : [],
  }

  const { data, error } = await supabase
    .from(PROJECTS_TABLE)
    .update(payload)
    .eq('id', projectId)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  const project = mapRowToProject(data)
  return attachSignedModelUrl(project)
}
