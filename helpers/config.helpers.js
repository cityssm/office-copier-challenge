import { Configurator } from '@cityssm/configurator';
import { config } from '../data/config.js';
import { configDefaultValues } from './config.defaults.js';
const configurator = new Configurator(configDefaultValues, config);
export function getConfigProperty(propertyName, fallbackValue) {
    return configurator.getConfigProperty(propertyName, fallbackValue);
}
export default {
    getConfigProperty
};
