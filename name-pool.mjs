import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { logger } from './logger.mjs'

const PROTECTED_MEMORY_NAME = 'agent_names'
const SYSTEM_MARKER = 'system: reserved'

const DEFAULT_NAMES = [
  'Aemilius Papinianus',
  'Agrippa the Skeptic',
  'Alcinous',
  'Alexander of Aphrodisias',
  'Ammonius Saccas',
  'Attalus',
  'Augustine of Hippo',
  'Boethius',
  'Caius Musonius Rufus',
  'Calcidius',
  'Cassius Longinus',
  'Cato the Younger',
  'Cicero',
  'Cleomedes',
  'Cornutus',
  'Demetrius the Cynic',
  'Demonax',
  'Dio Chrysostom',
  'Diogenes of Babylon',
  'Ennomus',
  'Epictetus',
  'Eudorus of Alexandria',
  'Favorinus',
  'Gaius Marius Victorinus',
  'Hierocles',
  'Hypatia',
  'Lucretius',
  'Macrobius',
  'Marcus Aurelius',
  'Maximus of Tyre',
  'Modestinus',
  'Numenius of Apamea',
  'Panaetius',
  'Peregrinus Proteus',
  'Philo of Alexandria',
  'Philodemus',
  'Plotinus',
  'Plutarch',
  'Porphyry',
  'Posidonius',
  'Proclus',
  'Quintilian',
  'Seneca the Younger',
  'Sextus Empiricus',
  'Sotion',
  'Syrianus',
  'Thrasea Paetus'
]

const dataDir = process.env.DATA_DIR || '/app/data'
let effectiveDataDir = dataDir
let availableNames = []
let managerRef = null
let claimChain = Promise.resolve()

const namesPath = () => join(effectiveDataDir, 'names.txt')

const ordinal = (n) => {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

const nextVariant = (name) => {
  const match = name.match(/^(.*) the (\d+)$/)
  if (match) {
    return `${match[1]} the ${ordinal(parseInt(match[2], 10) + 1)}`
  }
  return `${name} the 2nd`
}

const persistNamesFile = async () => {
  try {
    await mkdir(effectiveDataDir, { recursive: true })
  } catch {
    effectiveDataDir = 'data'
    logger.warn(`Cannot create ${dataDir}, falling back to ${effectiveDataDir}`)
    await mkdir(effectiveDataDir, { recursive: true })
  }
  const tmpFile = `${namesPath()}.tmp`
  await writeFile(tmpFile, `${availableNames.join('\n')}\n`)
  await rename(tmpFile, namesPath())
}

const writePoolMemory = async () => {
  if (!managerRef) return
  const observations = [SYSTEM_MARKER, ...availableNames]
  await managerRef.deleteEntities([PROTECTED_MEMORY_NAME])
  await managerRef.createEntities([{
    name: PROTECTED_MEMORY_NAME,
    entityType: 'memory',
    observations
  }])
}

export const isProtectedMemory = (name) => name === PROTECTED_MEMORY_NAME

export const getAvailableNames = () => [...availableNames]

export async function initNamePool(manager) {
  managerRef = manager
  try {
    await mkdir(effectiveDataDir, { recursive: true })
    availableNames = (await readFile(namesPath(), 'utf8'))
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
  } catch {
    availableNames = [...DEFAULT_NAMES]
    await persistNamesFile()
    logger.info(`Created ${namesPath()} with ${availableNames.length} default names`)
  }
  await writePoolMemory()
  logger.info(`Agent name pool: ${availableNames.length} names available (${namesPath()})`)
}

export function claimName(source) {
  if (!source || !managerRef) {
    return Promise.resolve(false)
  }
  const run = async () => {
    const index = availableNames.indexOf(source)
    if (index === -1) {
      return false
    }
    const next = nextVariant(source)
    availableNames.splice(index, 1, next)
    await persistNamesFile()
    await writePoolMemory()
    logger.info(`Agent identity "${source}" claimed, next available variant "${next}"`)
    return true
  }
  claimChain = claimChain.then(run, run)
  return claimChain
}
