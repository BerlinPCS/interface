import { redirect } from '@sveltejs/kit'

import { SETUP_VERSION } from '$lib'
import { getSetupVersion } from '$lib/modules/setup'
import { outdatedComponent } from '$lib/modules/update'

export async function load () {
  if (await outdatedComponent) return redirect(307, '/#/update')

  return { goto: await getSetupVersion() >= SETUP_VERSION ? '/#/app/home' : '/#/setup' }
}
