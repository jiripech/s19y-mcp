const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 }
const level = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info

const log = (name, threshold, args) => {
  if (LEVELS[name] >= threshold) {
    console.log(`[${name.toUpperCase()}]`, ...args)
  }
}

export const logger = {
  debug: (...args) => log('debug', level, args),
  info: (...args) => log('info', level, args),
  warn: (...args) => log('warn', level, args),
  error: (...args) => log('error', level, args)
}
