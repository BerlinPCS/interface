export {}

declare module 'native' {
  interface Native {
    getSetupVersion: (legacyVersion?: number) => Promise<number>
    completeSetup: (version: number) => Promise<void>
  }
}
