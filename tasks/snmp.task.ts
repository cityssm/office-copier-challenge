import Debug from 'debug'
import exitHook from 'exit-hook'
import snmp from 'net-snmp'

import getCopiers from '../database/getCopiers.js'
import getLatestCopierCountValue from '../database/getLatestCopierCountValue.js'
import recordCopierCount from '../database/recordCopierCount.js'
import { DEBUG_NAMESPACE } from '../debug.config.js'
import { community, oids } from '../helpers/oid.helpers.js'

const debug = Debug(`${DEBUG_NAMESPACE}:tasks:snmp`)

function recordLastKnownCount(copier: {
  copierId: number
  copierName: string
  ipAddress: string
}, oid: string): void {
  let lastCountValue: number | undefined

  try {
    lastCountValue = getLatestCopierCountValue({
      copierId: copier.copierId,
      countType: oid
    })
  } catch (error) {
    debug(
      `Error loading last known value for copier ${copier.copierName} (${copier.ipAddress}) and OID ${oid}:`,
      error
    )
    return
  }

  if (lastCountValue === undefined) {
    return
  }

  debug(
    `Recording last known count for copier ${copier.copierName} (${copier.ipAddress}): OID ${oid}, Value ${lastCountValue}`
  )

  recordCopierCount({
    copierId: copier.copierId,
    countType: oid,
    countValue: lastCountValue
  })
}

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
          recordLastKnownCount(copier, oid)
        } else {
          let didRecordCurrentValue = false

          for (const varbind of varbinds ?? []) {
            if (snmp.isVarbindError(varbind)) {
              debug(
                `SNMP error for copier ${copier.copierName} (${copier.ipAddress}):`,
                snmp.varbindError(varbind)
              )
            } else {
              const countValue = Number(varbind.value)

              if (!Number.isFinite(countValue)) {
                debug(
                  `Received non-numeric SNMP value from copier ${copier.copierName} (${copier.ipAddress}): OID ${varbind.oid}, Value ${varbind.value?.toString() ?? 'undefined'}`
                )
                continue
              }

              debug(
                `Received SNMP data from copier ${copier.copierName} (${copier.ipAddress}): OID ${varbind.oid}, Value ${countValue}`
              )

              recordCopierCount({
                copierId: copier.copierId,
                countType: varbind.oid,
                countValue
              })

              didRecordCurrentValue = true

              // If we received a valid response, we can stop waiting for more responses
              return
            }
          }

          if (!didRecordCurrentValue) {
            recordLastKnownCount(copier, oid)
          }
        }
      })
    }
  }
}

pollCopiers()

const interval = setInterval(pollCopiers, 5 * 60 * 1000)

exitHook(() => {
  clearInterval(interval)
})
