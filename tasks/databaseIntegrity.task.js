import Debug from 'debug';
import exitHook from 'exit-hook';
import backfillMissingCopierCountHours from '../database/backfillMissingCopierCountHours.js';
import purgeCopierCountsByHour from '../database/purgeCopierCountsByHour.js';
import { DEBUG_NAMESPACE } from '../debug.config.js';
const debug = Debug(`${DEBUG_NAMESPACE}:tasks:databaseIntegrity`);
const ONE_HOUR_MILLIS = 60 * 60 * 1000;
function runDatabaseIntegrityTask() {
    const purgedCount = purgeCopierCountsByHour();
    const backfilledCount = backfillMissingCopierCountHours();
    debug(`Database integrity updated: purged ${purgedCount.toString()} unnecessary records and backfilled ${backfilledCount.toString()} missing hourly records.`);
}
runDatabaseIntegrityTask();
const interval = setInterval(runDatabaseIntegrityTask, ONE_HOUR_MILLIS);
exitHook(() => {
    clearInterval(interval);
});
