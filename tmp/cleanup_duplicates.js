const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("=== Cleaning up orphaned duplicate patients ===\n");

    // 1. Find all patients with 0 procedures
    const allPatients = await prisma.patient.findMany({
        where: { deletedAt: null },
        include: {
            procedures: { select: { id: true } }
        }
    });

    const emptyPatients = allPatients.filter(p => p.procedures.length === 0);
    console.log(`Total patients: ${allPatients.length}`);
    console.log(`Patients with 0 procedures: ${emptyPatients.length}`);
    
    if (emptyPatients.length === 0) {
        console.log("No orphaned patients to clean up.");
        return;
    }

    console.log("\nOrphaned patients to delete:");
    for (const p of emptyPatients) {
        console.log(`  - ${p.id} | ${p.fullName} | MRN: ${p.mrn} | Created: ${p.createdAt}`);
    }

    // 2. Delete them
    const ids = emptyPatients.map(p => p.id);
    const deleted = await prisma.patient.deleteMany({
        where: { id: { in: ids } }
    });

    console.log(`\n✓ Deleted ${deleted.count} orphaned patients.`);
    
    // 3. Verify
    const remaining = await prisma.patient.count({ where: { deletedAt: null } });
    console.log(`Remaining patients: ${remaining}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
