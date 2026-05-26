import * as dateTimeFunctions from '@cityssm/utils-datetime'
import compression from 'compression'
import Debug from 'debug'
import express from 'express'
import createError, { type HttpError } from 'http-errors'

import { DEBUG_NAMESPACE, PROCESS_ID_MAX_DIGITS } from '../debug.config.js'
import * as configFunctions from '../helpers/config.helpers.js'
import packageJson from '../package.json' with { type: 'json' }
import routerDashboard from '../routes/dashboard.js'

export const version = packageJson.version

const debug = Debug(
  `${DEBUG_NAMESPACE}:app:${process.pid.toString().padEnd(PROCESS_ID_MAX_DIGITS)}`
)

/*
 * INITIALIZE APP
 */

export const app = express()

app.use((request, _response, next) => {
  debug(`${request.method} ${request.url}`)
  next()
})

/*
 * Configure Views
 */

app.set('views', 'views').set('view engine', 'ejs')

/*
 * Adjust headers
 */

app.disable('x-powered-by')

if (configFunctions.getConfigProperty('reverseProxy.disableEtag')) {
  app.set('etag', false)
}

if (!configFunctions.getConfigProperty('reverseProxy.disableCompression')) {
  app.use(compression())
}

/*
 * Parsers
 */

app.use(express.json())

app.use(
  express.urlencoded({
    extended: false
  })
)

/*
 * URL Prefix
 */

const urlPrefix = configFunctions.getConfigProperty('reverseProxy.urlPrefix')

if (urlPrefix !== '') {
  debug(`urlPrefix = ${urlPrefix}`)

  app.all('', (_request, response) => {
    response.redirect(urlPrefix)
  })
}

/*
 * Static content
 */

app
  .use(urlPrefix, express.static('public'))
  .use(`${urlPrefix}/lib/bulma`, express.static('node_modules/bulma/css'))
  .use(`${urlPrefix}/lib/echarts`, express.static('node_modules/echarts/dist'))
  .use(
    `${urlPrefix}/lib/fa/js/all.min.js`,
    express.static('node_modules/@fortawesome/fontawesome-free/js/all.min.js')
  )
  .use(
    `${urlPrefix}/lib/fa/css/all.min.css`,
    express.static('node_modules/@fortawesome/fontawesome-free/css/all.min.css')
  )

/*
 * Locals
 */

app.use((request, response, next) => {
  response.locals.buildNumber = version
  response.locals.configFunctions = configFunctions
  response.locals.dateTimeFunctions = dateTimeFunctions

  response.locals.urlPrefix = urlPrefix

  next()
})

/*
 * ROUTES
 */

app.use(`${urlPrefix}/`, routerDashboard)

/*
 * Error handling
 */

// Catch 404 and forward to error handler
app.use(
  (
    _request: express.Request,
    _response: express.Response,
    next: express.NextFunction
  ) => {
    next(createError(404))
  }
)

// Error handler
app.use(
  (
    error: Partial<HttpError>,
    request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    // Set locals, only providing error in development
    response.locals.message = error.message
    response.locals.error =
      request.app.get('env') === 'development' ? error : {}

    response.locals.configFunctions = configFunctions
    response.locals.urlPrefix = configFunctions.getConfigProperty(
      'reverseProxy.urlPrefix'
    )

    // Render the error page
    response.status(error.status ?? 500)
    response.render('error')
  }
)

export default app
