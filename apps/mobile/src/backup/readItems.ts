/**
 * Everything the member keeps, as packed records (pack.ts). MettleUp already reads them for the
 * cloud copy, so the backup uses that same reader; the old ForgeAI app (0.55.2) carries its own
 * copy of it in this file instead, so both apps write the same records.
 */
export { readLocalItems } from '@/cloud/copyLocal';
