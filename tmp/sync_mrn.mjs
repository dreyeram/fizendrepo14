
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- Syncing MRN Serial ---')
  
  const orgs = await prisma.organization.findMany()
  for (const org of orgs) {
    console.log(`Processing Org: ${org.name}`)
    
    try {
      const config = JSON.parse(org.uhidConfig || '{}')
      const prefix = config.prefix || 'MRN-'
      const suffix = config.suffix || ''
      
      const patients = await prisma.patient.findMany({
          where: { mrn: { startsWith: prefix } },
          select: { mrn: true }
      })
      
      let maxSerial = 0
      for (const p of patients) {
          const serialStr = p.mrn.replace(prefix, '').replace(suffix, '')
          const serial = parseInt(serialStr, 10)
          if (!isNaN(serial) && serial > maxSerial) {
              maxSerial = serial
          }
      }
      
      const nextSerial = maxSerial + 1
      if (nextSerial > config.currentSerial) {
          console.log(`  Updating serial from ${config.currentSerial} to ${nextSerial}`)
          const newConfig = { ...config, currentSerial: nextSerial }
          await prisma.organization.update({
              where: { id: org.id },
              data: { uhidConfig: JSON.stringify(newConfig) }
          })
          console.log(`  [SUCCESS] Serial updated to ${nextSerial}`)
      } else {
          console.log(`  [OK] Serial is already in sync (${config.currentSerial})`)
      }
      
    } catch (e) {
      console.error(`  [ERROR] Failed to sync org: ${e.message}`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
