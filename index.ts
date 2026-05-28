import { fork } from 'node:child_process'
import cluster, { type Worker } from 'node:cluster'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import Debug from 'debug'
import exitHook, { gracefulExit } from 'exit-hook'

import { initializeDatabase } from './database/initializeDatabase.js'
import { DEBUG_ENABLE_NAMESPACES, DEBUG_NAMESPACE } from './debug.config.js'
import packageJson from './package.json' with { type: 'json' }

if (process.env.NODE_ENV === 'development') {
  Debug.enable(DEBUG_ENABLE_NAMESPACES)
}

const debug = Debug(`${DEBUG_NAMESPACE}:index`)

let doShutdown = false

function initializeCluster(): void {
  const directoryName = path.dirname(fileURLToPath(import.meta.url))

  // eslint-disable-next-line @typescript-eslint/no-magic-numbers
  const processCount = Math.min(4, os.cpus().length * 2)

  process.title = 'Office Copier Challenge (Primary)'

  debug(`Primary pid:   ${process.pid}`)
  debug(`Primary title: ${process.title}`)
  debug(`Version:       ${packageJson.version}`)
  debug(`Launching ${processCount} processes`)

  /*
   * Set up the cluster
   */

  const clusterSettings = {
    exec: `${directoryName}/app/appProcess.js`
  }

  cluster.setupPrimary(clusterSettings)

  const activeWorkers = new Map<number, Worker>()

  for (let index = 0; index < processCount; index += 1) {
    const worker = cluster.fork()

    const pid = worker.process.pid

    if (pid === undefined) {
      debug(
        'Forked worker without a valid PID; not adding to activeWorkers map'
      )

      continue
    }

    activeWorkers.set(pid, worker)
  }

  cluster.on('exit', (worker) => {
    const pid = worker.process.pid

    if (pid === undefined) {
      debug(
        'Worker with unknown PID has been killed; cannot update activeWorkers map'
      )
    } else {
      debug(`Worker ${pid.toString()} has been killed`)

      activeWorkers.delete(pid)
    }

    if (!doShutdown) {
      debug('Starting another worker')
      const newWorker = cluster.fork()

      const newPid = newWorker.process.pid

      if (newPid === undefined) {
        debug(
          'Forked replacement worker without a valid PID; not adding to activeWorkers map'
        )

        return
      }

      activeWorkers.set(newPid, newWorker)
    }
  })

  /*
   * Set up the exit hook
   */

  exitHook(() => {
    doShutdown = true

    debug('Shutting down cluster workers...')

    for (const worker of activeWorkers.values()) {
      const pid = worker.process.pid

      debug(
        pid === undefined
          ? 'Killing worker with unknown PID'
          : `Killing worker ${pid}`
      )

      worker.kill()
    }
  })
}

function startApplication(): void {
  /*
   * Initialize the database
   */

  initializeDatabase()

  /*
   * Start other tasks
   */

  const childProcesses = [
    fork(path.join('tasks', 'snmp.task.js')),
    fork(path.join('tasks', 'databaseIntegrity.task.js'))
  ]

  exitHook(() => {
    for (const childProcess of childProcesses) {
      const pid = childProcess.pid

      debug(
        pid === undefined
          ? 'Killing child process with unknown pid'
          : `Killing child process ${pid}`
      )

      childProcess.kill()
    }
  })

  /*
   * Start workers
   */

  initializeCluster()
}

startApplication()

/*
 * Set up the startup test
 */

function handleSignal(signal: NodeJS.Signals): void {
  debug(`Received signal: ${signal}`)

  debug('Shutting down...')
  doShutdown = true

  gracefulExit()
}

process.on('SIGINT', handleSignal)
process.on('SIGTERM', handleSignal)
process.on('SIGUSR2', handleSignal)
