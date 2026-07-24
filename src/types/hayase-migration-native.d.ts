export {}

declare module 'native' {
  interface Native {
    hayaseMigrationState: () => Promise<{ available: boolean, source?: string }>
    hayaseMigrationImport: () => Promise<boolean>
  }
}
