import type { Request, Response } from 'express'

import { getConfigProperty } from '../helpers/config.helpers.js'

export default function handler(request: Request, response: Response): void {
  response.render('dashboard', {
    headTitle: getConfigProperty('application.applicationName')
  })
}
