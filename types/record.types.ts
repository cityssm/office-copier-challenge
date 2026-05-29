export interface Copier {
  copierId: number
  copierName: string
  ipAddress: string
  oid: string | null
  isActive: 0 | 1
}

export interface CopierCount {
  countId: number
  copierId: number
  timeMillis: number
  countType: string
  countValue: number
}
