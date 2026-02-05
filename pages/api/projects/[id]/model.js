import { saveProjectModel } from '../../../../lib/projectStore'

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '30mb',
    },
  },
}

function decodeBase64(fileData) {
  if (typeof fileData !== 'string' || !fileData) {
    throw new Error('Invalid file payload.')
  }

  const base64 = fileData.includes(',') ? fileData.split(',')[1] : fileData
  return Buffer.from(base64, 'base64')
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  try {
    const { id } = req.query
    const { fileName, fileData } = req.body || {}
    const buffer = decodeBase64(fileData)
    const project = await saveProjectModel(id, fileName, buffer)
    res.status(200).json({ project })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
}
