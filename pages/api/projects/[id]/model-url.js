import { getSignedModelUrl } from '../../../../lib/projectStore'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { id } = req.query
    const signedUrl = await getSignedModelUrl(id)
    if (!signedUrl) {
      res.status(404).json({ error: 'Model not found' })
      return
    }
    res.status(200).json({ signedUrl })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}
