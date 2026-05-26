import { minutesToMillis } from '@cityssm/to-millis'
import Debug from 'debug'
import exitHook from 'exit-hook'
import snmp from 'net-snmp'

import getCopiers from '../database/getCopiers.js'
import recordCopierCount from '../database/recordCopierCount.js'
import { DEBUG_NAMESPACE } from '../debug.config.js'
import { community, oids } from '../helpers/oid.helpers.js'

const pollingInterval = minutesToMillis(15)

const debug = Debug(`${DEBUG_NAMESPACE}:tasks:snmp`)

function pollCopiers(): void {
  const copiers = getCopiers()

  for (const copier of copiers) {
    const snmpSession = snmp.createSession(copier.ipAddress, community)

    for (const oid of oids) {
      snmpSession.get([oid], (error, varbinds) => {
        if (error) {
          debug(
            `Error polling copier ${copier.copierName} (${copier.ipAddress}):`,
            error
          )
        } else {
          for (const varbind of varbinds ?? []) {
            if (snmp.isVarbindError(varbind)) {
              debug(
                `SNMP error for copier ${copier.copierName} (${copier.ipAddress}):`,
                snmp.varbindError(varbind)
              )
            } else {
              const value = varbind.value

              debug(
                `Received SNMP data from copier ${copier.copierName} (${copier.ipAddress}): OID ${varbind.oid}, Value ${value?.toString() ?? 'undefined'}`
              )

              recordCopierCount({
                copierId: copier.copierId,
                countType: varbind.oid,
                countValue: Number(value)
              })

              // If we received a valid response, we can stop waiting for more responses
              return
            }
          }
        }
      })
    }
  }
}

pollCopiers()

const interval = setInterval(pollCopiers, pollingInterval)

exitHook(() => {
  clearInterval(interval)
})
