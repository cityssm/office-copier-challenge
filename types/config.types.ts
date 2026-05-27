export interface Config {
  application: {
    httpPort?: number
  }

  reverseProxy: {
    /** Disable Compression */
    disableCompression?: boolean

    /** Disable ETag */
    disableEtag?: boolean

    /** Disable Rate Limiting */
    disableRateLimit?: boolean

    /** Is traffic forwarded by a reverse proxy */
    trafficIsForwarded?: boolean

    /** URL Prefix, should start with a slash, but have no trailing slash */
    urlPrefix?: string
  }
}
