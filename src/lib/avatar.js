const MAX_FILE_SIZE = 10 * 1024 * 1024
const AVATAR_SIZE = 256
const MAX_DATA_URL_LENGTH = 400000

export async function createAvatarDataUrl(file) {
  if (!file) throw new Error('请选择一张图片。')
  if (!file.type?.startsWith('image/')) throw new Error('请选择图片文件。')
  if (file.size > MAX_FILE_SIZE) throw new Error('图片不能超过 10MB。')

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('无法读取这张图片，请换一张试试。')
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE
    const context = canvas.getContext('2d')
    if (!context) throw new Error('浏览器无法处理这张图片。')

    const scale = Math.max(AVATAR_SIZE / bitmap.width, AVATAR_SIZE / bitmap.height)
    const width = bitmap.width * scale
    const height = bitmap.height * scale

    context.fillStyle = '#f4f2ea'
    context.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      bitmap,
      (AVATAR_SIZE - width) / 2,
      (AVATAR_SIZE - height) / 2,
      width,
      height,
    )

    const dataUrl = canvas.toDataURL('image/webp', 0.82)
    if (!dataUrl || dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error('头像压缩后仍然过大，请换一张更简单的图片。')
    }
    return dataUrl
  } finally {
    bitmap.close?.()
  }
}
