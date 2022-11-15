import https from 'https'
import fs from 'fs'
import axios from 'axios'

// TODO代理？
const download = async (src: string, dirname: string) => {
  await axios.get(src, {
    responseType: 'stream',
    // FIXME 忽略SSL证书，不校验https证书，可能有风险
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
    timeout: 30000,
  }).then((res) => {
    res.data.pipe(fs.createWriteStream(dirname))
  }).catch((err) => {
    throw new Error(`文件下载失败: ${src}\n${err}`)
  })
}

export { download }

download('https://hi77-overseas.mangafuna.xyz/chaoziranwuzhuangdangdadang/dc782/16400795329514/h1500x.jpg', './imgs/test.jpg')

