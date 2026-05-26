import { Router } from 'express'

import handler_dashboard from '../handlers/dashboard.js'
import handler_doGetCopierCounts from '../handlers/doGetCopierCounts.js'

export const router = Router()

router
  .get('/', handler_dashboard)
  .post('/doGetCopierCounts', handler_doGetCopierCounts)

export default router
