import native from './native'

const LEGACY_SETUP_KEY = 'setup-finished'

export async function getSetupVersion (): Promise<number> {
  const legacyVersion = Number(localStorage.getItem(LEGACY_SETUP_KEY))
  return await native.getSetupVersion(Number.isSafeInteger(legacyVersion) ? legacyVersion : 0)
}

export async function completeSetup (version: number): Promise<void> {
  await native.completeSetup(version)
  localStorage.setItem(LEGACY_SETUP_KEY, version.toString())
}
