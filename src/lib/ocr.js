let workerPromise = null
let progressListener = null

export async function recognizeEnglishImage(image, onProgress) {
  progressListener = onProgress

  if (!workerPromise) {
    const { createWorker } = await import('tesseract.js')
    const assetBase = new URL(`${import.meta.env.BASE_URL}tesseract/`, window.location.href)
    workerPromise = createWorker('eng', 1, {
      workerPath: new URL('worker.min.js', assetBase).href,
      corePath: new URL('tesseract-core-lstm.wasm.js', assetBase).href,
      langPath: assetBase.href.replace(/\/$/, ''),
      workerBlobURL: false,
      logger: (message) => {
        progressListener?.(
          Math.round((message.progress || 0) * 100),
          message.status || '',
        )
      },
    }).catch((error) => {
      workerPromise = null
      throw error
    })
  }

  const worker = await workerPromise
  const result = await worker.recognize(image)
  return result.data.text || ''
}
