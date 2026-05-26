import path from 'node:path'

import type { ServiceConfig } from 'node-windows'

const _dirname = '.'

export const serviceConfig: ServiceConfig = {
  name: 'Office Copier Challenge',

  description:
    'An initiative to help reduce paper usages by tracking how much we print.',

  script: path.join(_dirname, 'index.js')
}
