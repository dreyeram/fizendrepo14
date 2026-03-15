const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const patients = await prisma.patient.findMany({
    take: 20,
    orderBy: { createdAt: 'desc' },
    include: {
      procedures: true
    }
  });

  console.log(JSON.stringify(patients.map(p => ({
    id: p.id,
    fullName: p.fullName,
    procedures: p.procedures.map(pr => ({ id: pr.id, type: pr.type, source: pr.source }))
  })), null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
