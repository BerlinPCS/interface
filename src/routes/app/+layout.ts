import { error, redirect } from '@sveltejs/kit'

import { dev } from '$app/environment'
import { SETUP_VERSION } from '$lib'
import native from '$lib/modules/native'
import { getSetupVersion } from '$lib/modules/setup'
import { outdatedComponent } from '$lib/modules/update'

export async function load () {
  if (!dev && !native.isApp) return error(401, 'How did you get here?')
  if (await getSetupVersion() < SETUP_VERSION) redirect(307, '/#/setup')

  if (await outdatedComponent) redirect(307, '/#/update')
}
