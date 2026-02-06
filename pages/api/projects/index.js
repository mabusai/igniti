import { createProject, listProjects } from '../../../lib/projectStore'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const projects = await listProjects()
      res.status(200).json({ projects })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
    return
  }

  if (req.method === 'POST') {
    try {
      const { name } = req.body || {}
      const project = await createProject(name)
      res.status(201).json({ project })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
    return
  }

  res.setHeader('Allow', ['GET', 'POST'])
  res.status(405).json({ error: 'Method not allowed' })
}
