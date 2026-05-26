import Debug from 'debug';
import exitHook from 'exit-hook';
import purgeCopierCountsByHour from '../database/purgeCopierCountsByHour.js';
import { DEBUG_NAMESPACE } from '../debug.config.js';
const debug = Debug(`${DEBUG_NAMESPACE}:tasks:purgeCounts`);
const ONE_HOUR_MILLIS = 60 * 60 * 1000;
function purgeCopierCounts() {
    const purgedCount = purgeCopierCountsByHour();
    debug(`Purged ${purgedCount.toString()} unnecessary copier count records.`);
}
purgeCopierCounts();
const interval = setInterval(purgeCopierCounts, ONE_HOUR_MILLIS);
exitHook(() => {
    clearInterval(interval);
});
