import fs from 'fs'
import path from 'path'

export const saveThumbnailHandler = async (
  _: unknown,
  projectPath: string | null,
  snapshotId: string,
  dataUrl: string,
): Promise<string | null> => {
  if (!projectPath) {
    console.error('Cannot save thumbnail: no project path')
    return null
  }

  try {
    const projectDir = path.dirname(projectPath)
    const projectName = path.basename(projectPath, '.json')
    const snapshotsDir = path.join(projectDir, projectName)

    // Create snapshots directory if it doesn't exist
    if (!fs.existsSync(snapshotsDir)) {
      fs.mkdirSync(snapshotsDir, { recursive: true })
    }

    const thumbnailPath = path.join(snapshotsDir, `${snapshotId}.png`)

    // Convert data URL to buffer
    const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // Write file
    fs.writeFileSync(thumbnailPath, buffer)

    // Return relative path from project file
    return path.join(projectName, `${snapshotId}.png`)
  } catch (err) {
    console.error('Error saving thumbnail:', err)
    return null
  }
}

export const deleteThumbnailHandler = async (
  _: unknown,
  projectPath: string | null,
  thumbnailPath: string,
): Promise<boolean> => {
  if (!projectPath || !thumbnailPath) {
    return false
  }

  try {
    const projectDir = path.dirname(projectPath)
    const fullPath = path.join(projectDir, thumbnailPath)

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }

    return true
  } catch (err) {
    console.error('Error deleting thumbnail:', err)
    return false
  }
}
