import { getConfigProperty } from '../helpers/config.helpers.js';
export default function handler(request, response) {
    response.render('dashboard', {
        headTitle: getConfigProperty('application.applicationName')
    });
}
