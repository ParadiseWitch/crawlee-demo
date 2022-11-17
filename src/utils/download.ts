import { createWriteStream } from 'fs'
import got from 'got'
import { HttpsProxyAgent } from 'hpagent'
import { mkdir } from './fileutil.js'

type OnProgressType = (opts: {
  transferred: number
  total: number
  percent: number
}
) => void

const download = (url: string, path: string, onProgress?: OnProgressType): Promise<void> => {
  return new Promise((resolve, reject) => {
    const dirStrArr = path.split('/')
    const fileName = dirStrArr[dirStrArr.length - 1]
    try {
      mkdir(path)
    }
    catch (error) {
      reject(error)
    }
    const fileWriterStream = createWriteStream(path)
    fileWriterStream
      .on('error', (error) => {
        reject(error)
      })
      .on('finish', () => {
        resolve()
      })

    const downloadStream = got.stream(url, {
      agent: {
        https: new HttpsProxyAgent({
          keepAlive: true,
          keepAliveMsecs: 1000,
          maxSockets: 256,
          maxFreeSockets: 256,
          scheduling: 'lifo',
          proxy: 'http://127.0.0.1:1087',
        }),
      },
    })
    downloadStream
      .on('downloadProgress', ({ transferred, total, percent }) => {
        onProgress && onProgress({ transferred, total, percent })
      })
      .on('error', (error) => {
        reject(error)
      })

    downloadStream.pipe(fileWriterStream)
  })
}

export default download

