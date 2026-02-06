import { saveProjectScene } from '../../../../lib/projectStore'

export default async function handler(req, res) {
  if (req.method !== 'PUT') {
    res.setHeader('Allow', ['PUT'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { id } = req.query
    const { fires, cameras } = req.body || {}
    const project = await saveProjectScene(id, { fires, cameras })
    res.status(200).json({ project })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}
