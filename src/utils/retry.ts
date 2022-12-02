export const delay = (delayTimes = 1000) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(null)
    }, delayTimes)
  })
}
const retry = async <R>(fn: () => R, num = 3, delayTimes = 500) => {
  let i = num
  let ret: R | null = null
  while (i > 0) {
    try {
      ret = await fn()
    }
    catch (e) {
      i--
      if (i <= 0)
        throw e

      await delay(delayTimes)
      continue
    }
    break
  }
  return ret
}

export default retry

