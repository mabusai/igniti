import { getProjectById } from '../../../lib/projectStore'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { id } = req.query
  const project = await getProjectById(id)

  if (!project) {
    res.status(404).json({ error: 'Project not found' })
    return
  }

  res.status(200).json({ project })
}
