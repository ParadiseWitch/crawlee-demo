import type { Log, RequestOptions } from 'crawlee'
import { PlaywrightCrawler, ProxyConfiguration, createPlaywrightRouter } from 'crawlee'
import type { Page } from 'playwright'
import download from './utils/download.js'
import { getSize, isExist, mkdir } from './utils/fileutil.js'
import retry from './utils/retry.js'

const host = 'https://www.copymanga.site'

interface SpiderOption {
  chapterRange?: number[]
  imgRange?: number[]
}

interface ChapterData {
  url: string
  title: string
}

const proxyConfiguration = new ProxyConfiguration({
  proxyUrls: ['http://127.0.0.1:1087'],
})

const allChapterAttrMap: Record<string, ChapterData[]> = {}

// 保存章节数据
const getAllChapterData = async (comicName: string, page: Page, log: Log) => {
  let chapterData = allChapterAttrMap[comicName]
  if (chapterData && chapterData.length !== 0)
    return allChapterAttrMap[comicName]

  await page.waitForSelector('.row > .col-9 > ul > li > h6')
  const comicTitle = (await page.locator('.row > .col-9 > ul > li > h6').textContent()) || '暂无标题'
  log.info(`开始采集漫画《${comicTitle}》...`)
  log.info(`创建文件夹./caputer/${comicTitle}/`)
  mkdir(`./caputer/${comicTitle}/`)

  await page.waitForSelector('#default全部 ul:first-child a')
  chapterData = await page.$$eval<ChapterData[], HTMLElement>(
    '#default全部 ul:first-child a',
    (els, host) =>
      els.map(
        (el, index): ChapterData => {
          let url: string = (host as unknown) as string
          if (el)
            url += el.getAttribute('href')

          console.error(`获取不到第${index}个章节的url`)
          return {
            url,
            title: el.textContent || '暂无标题',
          }
        },
      ),
    host,
  )

  log.info(`漫画《${comicTitle}》共有${chapterData.length}个章节`)
  allChapterAttrMap[comicName] = chapterData
  return chapterData
}

type EndCondition = (page: Page, log?: Log) => boolean | PromiseLike<boolean>

const scrollToBottom = async (endCondition: EndCondition, page: Page, log?: Log) => {
  await page.keyboard.press('PageDown')
  await page.waitForTimeout(100)
  if (await endCondition(page, log))
    return
  await scrollToBottom(endCondition, page, log)
}

export const withSpider = (comicRouter: string) => {
  // 漫画名默认取最后的路由
  let comicName: string = comicRouter
  // 路由
  const router = createPlaywrightRouter()

  // 漫画详情页路由
  router.addHandler<SpiderOption>('COMIC', async ({
    request,
    page,
    log,
    crawler,
  }) => {
    log.info(`加载url：${request.url}`)
    await page.waitForSelector('h6[title]')
    comicName = await page.locator('h6[title]').textContent() || comicRouter

    let targetChapterData = await getAllChapterData(comicName, page, log)
    const userData = request.userData
    if (userData && userData.chapterRange && userData.chapterRange.length === 2) {
      const chapterRange = request.userData.chapterRange as number[]
      targetChapterData = targetChapterData.slice(...chapterRange)
    }

    // 章节url放入请求队列
    await crawler.addRequests(targetChapterData.map((c) => {
      const newRequest: RequestOptions<SpiderOption> = {
        url: c.url,
        label: 'CHAPTER',
        userData,
      }
      return newRequest
    }))
  })

  // 章节详情页路由，即每话的漫画页面
  router.addHandler<SpiderOption>('CHAPTER', async ({
    request,
    page,
    log,
  }) => {
    // 获取章节名
    await page.waitForSelector('h4.header')
    const headerStr = await page.locator('h4.header').first().textContent()
    const chapterName = headerStr?.split('/')[headerStr?.split('/').length - 1]
    log.info(`开始下载《${chapterName}》的图片, 链接：${request.url}`)

    // TODO:更新策略

    // 创建章节文件夹
    const chapterPath = `./caputer/${comicName}/${chapterName}`
    // const chapterIsExist = isExist(chapterPath)
    // if (chapterIsExist) {
    //   const files: string[] = getFiles(chapterPath)
    //   if (files && files.length !== 0)
    //     log.info(`${chapterPath} 该文件夹下已有文件，跳过下载`)
    // }
    mkdir(chapterPath)

    // 手机大小的视图
    await page.setViewportSize({
      width: 500,
      height: 637,
    })

    // 获取本章漫画页数
    await page.waitForSelector('body > div > .comicCount')
    const pageNum = await page.locator('body > div > .comicCount').first().textContent()
    log.info(`本话共有 ${pageNum} 页`)

    // 等待漫画内容容器的Dom节点加载
    await page.waitForSelector('.container-fluid > .container > .comicContent-list')

    // 一直滚动到底部，触发图片加载
    await scrollToBottom(async (page: Page, log?: Log) => {
      // 默认如果漫画页数的Dom节点，那么这个节点也会加载
      const pageIndex = await page.locator('body > div > .comicIndex').first().textContent()
      log && log.info(`到达最后的漫画页数： ${pageIndex}`)
      return pageIndex === pageNum
    }, page, log)

    // 获取所有漫画图片链接
    const imgs = await page.$$eval(
      '.container-fluid > .container > .comicContent-list > li > img',
      els => els.map(el => el.getAttribute('data-src') || ''),
    )

    let start = 0
    let targetImgs = imgs
    const userData = request.userData
    if (userData && userData.imgRange && userData.imgRange.length === 2) {
      const imgRange = userData.imgRange as number[]
      start = imgRange[0] || 0
      targetImgs = targetImgs.slice(...imgRange)
    }

    for (let i = 0; i < targetImgs.length; i++) {
      const img = targetImgs[i]
      const ext = img.slice(img.lastIndexOf('.') + 1)
      retry(async () => {
        const downloadPath = `./caputer/${comicName}/${chapterName}/第${start + i + 1}页.${ext}`
        if (isExist(downloadPath) && getSize(downloadPath) > 0)
          return

        await download(img, downloadPath)
      }, 10, 1000).then(() => {
        log.info(`下载第${start + i + 1}页成功！`)
      }).catch((err) => {
        log.error(`下载第${start + i + 1}页失败！`, err.toString())
      })
    }
  })

  // 爬取部分章节
  const spider = async (opts: SpiderOption) => {
    // 常见爬虫队列
    const crawler = new PlaywrightCrawler({
      proxyConfiguration,
      requestHandler: router,
      // headless: false,
    })
    // 添加请求队列
    const targetUrl = `${host}/comic/${comicRouter}`
    const request: RequestOptions<SpiderOption> = {
      url: targetUrl,
      label: 'COMIC',
      userData: opts,
    }
    await crawler.addRequests([request])
    // 执行爬虫
    await crawler.run()
  }

  return {
    spider,
  }
}

const copyComicSpider = withSpider('dianjuren')
copyComicSpider.spider({
  chapterRange: [117, 118],
  // imgRange: [136, 190],
})
//
// copyComicSpider.spider({
//   chapterRange: [116, 119],
//   // imgRange: [136, 190],
// })
