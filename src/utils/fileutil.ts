import path from 'path'
import fs from 'fs'

export const isExist = (dirname: string): boolean => {
  try {
    fs.accessSync(dirname, fs.constants.F_OK)
  }
  catch (error) {
    return false
  }
  return true
}

export const mkdir = (dirname: string) => {
  dirname = dirname.replace(/\/[^\/]*$/, '')
  const exist = isExist(dirname)
  if (!exist) {
    mkdir(`${path.dirname(dirname)}/`)
    fs.mkdirSync(dirname)
  }
}

export const getFiles = (dirname: string): string[] => {
  if (!isExist(dirname))
    throw new Error(`${dirname} 文件/文件夹不存在！`)
  return fs.readdirSync(dirname)
}
