import fs from 'fs'
import path from 'path'
import { dialog } from 'electron'
import { ProjectData } from '@hedron/app-store'
import { SaveProjectResponse } from '@shared/Events'

const isSubdirectory = (parentDir: string, directory: string) => {
  const resolvedParentDir = path.resolve(parentDir)
  const resolvedDirectory = path.resolve(directory)

  // Check if the directory starts with the parent directory path
  return resolvedDirectory.startsWith(resolvedParentDir + path.sep)
}

const convertPathToRelative = (projectFilePath: string, sketchesDirPath: string) => {
  // skip if sketches dir is already relative
  if (!path.isAbsolute(sketchesDirPath)) return sketchesDirPath

  const parentDir = path.dirname(projectFilePath)

  // Check if the target directory is inside the parent directory
  if (isSubdirectory(parentDir, sketchesDirPath)) {
    // Get the relative path from the parent directory to the target directory
    return path.relative(parentDir, sketchesDirPath)
  }

  // Return absolute if it's not a relative
  return sketchesDirPath
}

const cleanupOrphanedThumbnails = async (projectPath: string, projectData: ProjectData) => {
  try {
    const projectDir = path.dirname(projectPath)
    const projectName = path.basename(projectPath, '.json')
    const snapshotsDir = path.join(projectDir, projectName)

    // Check if snapshots directory exists
    if (!fs.existsSync(snapshotsDir)) {
      return
    }

    // Get all referenced thumbnail paths from project data
    const referencedThumbnails = new Set<string>()
    const snapshots = projectData.engine.snapshots || {}

    Object.values(snapshots).forEach((snapshot) => {
      if (snapshot.thumbnailPath) {
        // Get just the filename from the path
        const filename = path.basename(snapshot.thumbnailPath)
        referencedThumbnails.add(filename)
      }
    })

    // Read all files in the snapshots directory
    const files = fs.readdirSync(snapshotsDir)
    // Delete unreferenced files
    let deletedCount = 0
    for (const file of files) {
      if (!referencedThumbnails.has(file)) {
        const filePath = path.join(snapshotsDir, file)
        fs.unlinkSync(filePath)
        deletedCount++
        console.log(`Deleted orphaned thumbnail: ${file}`)
      }
    }

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} orphaned thumbnail(s)`)
    }
  } catch (err) {
    console.error('Error cleaning up orphaned thumbnails:', err)
  }
}

export const saveProjectFile = async (
  projectData: ProjectData,
  _savePath: string | null,
): Promise<SaveProjectResponse> => {
  let savePath = _savePath

  if (!savePath) {
    const result = await dialog.showSaveDialog({
      filters: [{ name: 'Project', extensions: ['json'] }],
    })

    if (result.canceled) {
      return {
        result: 'canceled',
      }
    }

    savePath = result.filePath
  }

  projectData.app.sketchesDir = convertPathToRelative(savePath, projectData.app.sketchesDir)

  try {
    // Clean up orphaned thumbnails before saving
    await cleanupOrphanedThumbnails(savePath, projectData)

    const fileContent = JSON.stringify(projectData, undefined, 4)

    await fs.writeFileSync(savePath, fileContent, { encoding: 'utf8' })

    return {
      result: 'success',
      savePath,
    }
  } catch (err) {
    console.error('Error saving the project file:', err)
    return { result: 'error', error: 'Failed to save the project file' }
  }
}
