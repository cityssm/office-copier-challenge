import eslintCspell from '@cspell/eslint-plugin'
import configWebApp, { defineConfig } from 'eslint-config-cityssm'
import { cspellWords } from 'eslint-config-cityssm/exports'
import eslintPluginNoUnsanitized from 'eslint-plugin-no-unsanitized'

/* eslint-disable no-secrets/no-secrets */

const escapedMethods = [
  'cityssm.escapeHTML'
]

/* eslint-enable no-secrets/no-secrets */

export const config = defineConfig(
  configWebApp,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true
      }
    },
    plugins: {
      '@cspell': eslintCspell,

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      'no-unsanitized': eslintPluginNoUnsanitized
    },
    rules: {
      '@cspell/spellchecker': [
        'warn',
        {
          cspell: {
            words: [
              ...cspellWords,
              'snmp',
              'varbind',
              'varbinds'
            ]
          }
        }
      ],
      '@typescript-eslint/no-unsafe-type-assertion': 'off',

      'no-unsanitized/method': [
        'error',
        {
          escape: {
            methods: escapedMethods
          }
        }
      ],

      'no-unsanitized/property': [
        'error',
        {
          escape: {
            methods: escapedMethods
          }
        }
      ]
    }
  }
)

export default config
