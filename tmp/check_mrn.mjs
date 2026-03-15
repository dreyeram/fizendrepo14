
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('--- MRN Diagnostic ---')
  
  // 1. Get all organizations and their uhidConfigs
  const orgs = await prisma.organization.findMany()
  for (const org of orgs) {
    console.log(`Org: ${org.name} (ID: ${org.id})`)
    console.log(`uhidConfig: ${org.uhidConfig}`)
    
    try {
      const config = JSON.parse(org.uhidConfig || '{}')
      console.log(`  Parsed Serial: ${config.currentSerial}`)
      
      const prefix = config.prefix || 'MRN-'
      const digits = config.digits || 6
      const suffix = config.suffix || ''
      const expectedNextMrn = `${prefix}${config.currentSerial.toString().padStart(digits, '0')}${suffix}`
      console.log(`  Expected Next MRN: ${expectedNextMrn}`)
      
      // 2. Check if this MRN already exists
      const existing = await prisma.patient.findUnique({
        where: { mrn: expectedNextMrn }
      })
      
      if (existing) {
        console.warn(`  [COLLISION] Predicted MRN ${expectedNextMrn} already exists for patient: ${existing.fullName} (ID: ${existing.id})`)
      } else {
        console.log(`  [OK] Predicted MRN ${expectedNextMrn} is available.`)
      }
      
      // 3. Find the highest serial-based MRN
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
      console.log(`  Highest Serial found in DB: ${maxSerial}`)
      
      if (maxSerial >= config.currentSerial) {
          console.error(`  [MISMATCH] Serial in config (${config.currentSerial}) is NOT greater than highest serial in DB (${maxSerial}).`)
          console.log(`  Recommend updating config to serial: ${maxSerial + 1}`)
      }
      
    } catch (e) {
      console.error(`  Failed to parse or check config: ${e.message}`)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
