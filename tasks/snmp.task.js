import { ScheduledTask } from '@cityssm/scheduled-task';
import Debug from 'debug';
import exitHook from 'exit-hook';
import snmp from 'net-snmp';
import getCopiers from '../database/getCopiers.js';
import getLatestCopierCountValue from '../database/getLatestCopierCountValue.js';
import recordCopierCount from '../database/recordCopierCount.js';
import { DEBUG_NAMESPACE } from '../debug.config.js';
import { community, oid } from '../helpers/oid.helpers.js';
const debug = Debug(`${DEBUG_NAMESPACE}:tasks:snmp`);
function recordLastKnownCount(copier, oid) {
    let lastCountValue;
    try {
        lastCountValue = getLatestCopierCountValue({
            copierId: copier.copierId,
            countType: oid
        });
    }
    catch (error) {
        debug(`Error loading last known value for copier ${copier.copierName} (${copier.ipAddress}) and OID ${oid}:`, error);
        return;
    }
    if (lastCountValue === undefined) {
        return;
    }
    debug(`Recording last known count for copier ${copier.copierName} (${copier.ipAddress}): OID ${oid}, Value ${lastCountValue}`);
    recordCopierCount({
        copierId: copier.copierId,
        countType: oid,
        countValue: lastCountValue
    });
}
function pollCopiers() {
    debug('Polling copiers via SNMP');
    const copiers = getCopiers();
    for (const copier of copiers) {
        const snmpSession = snmp.createSession(copier.ipAddress, community);
        const oidToPoll = copier.oid ?? oid;
        try {
            debug(`Polling copier ${copier.copierName} (${copier.ipAddress}) for OID ${oidToPoll}`);
            snmpSession.get([oidToPoll], (error, varbinds) => {
                if (error) {
                    debug(`Error polling copier ${copier.copierName} (${copier.ipAddress}):`, error);
                    recordLastKnownCount(copier, oidToPoll);
                }
                else {
                    let didRecordCurrentValue = false;
                    debug(`Received SNMP response from copier ${copier.copierName} (${copier.ipAddress})`);
                    for (const varbind of varbinds ?? []) {
                        if (snmp.isVarbindError(varbind)) {
                            debug(`SNMP error for copier ${copier.copierName} (${copier.ipAddress}):`, snmp.varbindError(varbind));
                        }
                        else {
                            const countValue = Number(varbind.value);
                            if (!Number.isFinite(countValue)) {
                                debug(`Received non-numeric SNMP value from copier ${copier.copierName} (${copier.ipAddress}): OID ${varbind.oid}, Value ${varbind.value?.toString() ?? 'undefined'}`);
                                continue;
                            }
                            debug(`Received SNMP data from copier ${copier.copierName} (${copier.ipAddress}): OID ${varbind.oid}, Value ${countValue}`);
                            recordCopierCount({
                                copierId: copier.copierId,
                                countType: varbind.oid,
                                countValue
                            });
                            didRecordCurrentValue = true;
                            return;
                        }
                    }
                    if (!didRecordCurrentValue) {
                        recordLastKnownCount(copier, oidToPoll);
                    }
                }
                snmpSession.close();
            });
        }
        catch (error) {
            debug(`Error initiating SNMP session for copier ${copier.copierName} (${copier.ipAddress}):`, error);
            recordLastKnownCount(copier, oidToPoll);
        }
    }
}
debug('Starting SNMP polling task');
const task = new ScheduledTask('SNMP Polling', pollCopiers, {
    schedule: '59,39,19 * * * *'
});
await task.runTask();
task.startTask();
exitHook(() => {
    task.stopTask();
});
