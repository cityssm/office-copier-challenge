import * as dateTimeFunctions from '@cityssm/utils-datetime';
import compression from 'compression';
import Debug from 'debug';
import express from 'express';
import createError from 'http-errors';
import { DEBUG_NAMESPACE, PROCESS_ID_MAX_DIGITS } from '../debug.config.js';
import * as configFunctions from '../helpers/config.helpers.js';
import packageJson from '../package.json' with { type: 'json' };
import routerDashboard from '../routes/dashboard.js';
export const version = packageJson.version;
const debug = Debug(`${DEBUG_NAMESPACE}:app:${process.pid.toString().padEnd(PROCESS_ID_MAX_DIGITS)}`);
export const app = express();
app.use((request, _response, next) => {
    debug(`${request.method} ${request.url}`);
    next();
});
app.set('views', 'views').set('view engine', 'ejs');
app.disable('x-powered-by');
if (configFunctions.getConfigProperty('reverseProxy.disableEtag')) {
    app.set('etag', false);
}
if (!configFunctions.getConfigProperty('reverseProxy.disableCompression')) {
    app.use(compression());
}
app.use(express.json());
app.use(express.urlencoded({
    extended: false
}));
const urlPrefix = configFunctions.getConfigProperty('reverseProxy.urlPrefix');
if (urlPrefix !== '') {
    debug(`urlPrefix = ${urlPrefix}`);
    app.all('', (_request, response) => {
        response.redirect(urlPrefix);
    });
}
app
    .use(urlPrefix, express.static('public'))
    .use(`${urlPrefix}/lib/bulma`, express.static('node_modules/bulma/css'))
    .use(`${urlPrefix}/lib/echarts`, express.static('node_modules/echarts/dist'))
    .use(`${urlPrefix}/lib/fa`, express.static('node_modules/@fortawesome/fontawesome-free'));
app.use((request, response, next) => {
    response.locals.buildNumber = version;
    response.locals.configFunctions = configFunctions;
    response.locals.dateTimeFunctions = dateTimeFunctions;
    response.locals.urlPrefix = urlPrefix;
    next();
});
app.use(`${urlPrefix}/`, routerDashboard);
app.use((_request, _response, next) => {
    next(createError(404));
});
app.use((error, request, response, _next) => {
    response.locals.message = error.message;
    response.locals.error =
        request.app.get('env') === 'development' ? error : {};
    response.locals.configFunctions = configFunctions;
    response.locals.urlPrefix = configFunctions.getConfigProperty('reverseProxy.urlPrefix');
    response.status(error.status ?? 500);
    response.render('error');
});
export default app;
