import path from 'path'
import fs from 'fs'

import type { Log } from 'crawlee'
import { PlaywrightCrawler, ProxyConfiguration, createPlaywrightRouter } from 'crawlee'

import type { Page } from 'playwright'
import { getFiles, isExist, mkdir } from './utils/fileutil.js'

const host = 'https://www.copymanga.site'

// interface SpiderChapterOption {
//   range?: number[]
// }

interface ChapterData {
  url: string
  title: string
}

const proxyConfiguration = new ProxyConfiguration({
  proxyUrls: ['http://127.0.0.1:1087'],
})

const allChapterAttrMap: Record<string, ChapterData[]> = {}

export const spiderComicChapters = async (comicName: string) => {
  // 路由
  const router = createPlaywrightRouter()

  // 漫画详情页路由
  router.addHandler('COMIC', async ({ request, page, log, crawler }) => {
    log.info(`加载url：${request.url}`)
    const chapterData = await getAllChapterData(page, log)

    // 章节url放入请求队列
    await crawler.addRequests(chapterData.map((c) => {
      return { url: c.url, label: 'CHAPTER' }
    }))
  })

  // 章节详情页路由，即每话的漫画页面 //TODO 待测试
  router.addHandler('CHAPTER', async ({ request, page, log }) => {
    // 获取章节名
    await page.waitForSelector('h4.header')
    const headerStr = await page.locator('h4.header').first().textContent()
    const chapterName = headerStr?.split('/')[headerStr?.split('/').length - 1]
    log.info(`开始下载《${chapterName}》的图片, 链接：${request.url}`)

    // TODO:更新策略

    // 创建章节文件夹
    const chapterPath = `./caputer/${comicName}/${chapterName}`
    const chapterIsExist = isExist(chapterPath)
    if (chapterIsExist) {
      const files: string[] = getFiles(chapterPath)
      if (files && files.length !== 0)
        log.info(`${chapterPath} 该文件夹下已有文件，跳过下载`)
    }
    mkdir(chapterPath)

    // 手机大小的视图
    await page.setViewportSize({ width: 500, height: 637 })

    // 获取本章漫画页数
    await page.waitForSelector('body > div > .comicCount')
    const pageNum = await page.locator('body > div > .comicCount').first().textContent()
    log.info(`本话共有 ${pageNum} 页`)

    // 等待漫画内容容器的Dom节点加载
    await page.waitForSelector('.container-fluid > .container > .comicContent-list')

    // 一直滚动到底部，触发图片加载
    const scrollToBottom = async () => {
      await page.keyboard.press('PageDown')
      await page.waitForTimeout(100)
      // 默认如果漫画页数的Dom节点，那么这个节点也会加载
      const pageIndex = await page.locator('body > div > .comicIndex').first().textContent()
      if (pageNum === pageIndex) {
        log.info(`到达最后的漫画页数： ${pageIndex}`)
        return
      }
      await scrollToBottom()
    }
    await scrollToBottom()

    // 获取所有漫画图片链接
    const imgs = await page.$$eval(
      '.container-fluid > .container > .comicContent-list > li > img',
      els => els.map(el => el.getAttribute('data-src') || ''),
    )

    log.info(`imgs: ${imgs}`)

    // TODO添加图片到爬虫队列？或者直接下载
    await crawler.addRequests(
      imgs.filter(img => img).map((img) => {
        return { url: img, label: 'CHAPTER' }
      }),
    )
  })

  // 保存章节数据
  const getAllChapterData = async (page: Page, log: Log) => {
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

    log.info(`urlArr: ${chapterData.map(c => `${c.title}: ${c.url}`).join('\n')}`)
    log.info(`漫画《${comicTitle}》共有${chapterData.length}个章节`)
    allChapterAttrMap[comicName] = chapterData
    return chapterData
  }

  // 常见爬虫队列
  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    requestHandler: router,
  // headless: false,
  })

  // 添加请求队列
  const targetUrl = `${host}/comic/${comicName}`
  await crawler.addRequests([{
    url: targetUrl,
    label: 'COMIC',
  }])

  // 执行爬虫
  await crawler.run()
}

spiderComicChapters('chaoziranwuzhuangdangdadang')
