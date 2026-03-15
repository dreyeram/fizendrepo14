const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log("=== Verifying source field retrieval ===\n");

    // 1. Get all patients with their procedures
    const patients = await prisma.patient.findMany({
        where: { deletedAt: null },
        include: { procedures: true },
        orderBy: { updatedAt: 'desc' }
    });

    // 2. Get all proc IDs
    const allProcIds = patients.flatMap(p => p.procedures.map(pr => pr.id));
    
    if (allProcIds.length === 0) {
        console.log("No procedures found.");
        return;
    }

    // 3. Fetch source via raw SQL
    const placeholders = allProcIds.map(() => '?').join(',');
    const rawSources = await prisma.$queryRawUnsafe(
        `SELECT id, source FROM Procedure WHERE id IN (${placeholders})`,
        ...allProcIds
    );

    const sourceMap = {};
    for (const row of rawSources) {
        sourceMap[row.id] = row.source;
    }

    // 4. Show results
    console.log("Patients and procedure sources:");
    for (const p of patients) {
        const procInfo = p.procedures.map(pr => ({
            type: pr.type,
            prismaSource: pr.source,
            rawSqlSource: sourceMap[pr.id]
        }));
        if (procInfo.some(pi => pi.rawSqlSource)) {
            console.log(`\n✓ ${p.fullName} (${p.mrn}):`);
            procInfo.forEach(pi => console.log(`    type: ${pi.type} | prisma: ${pi.prismaSource} | raw: ${pi.rawSqlSource}`));
        }
    }

    // 5. Summary
    const withSource = Object.values(sourceMap).filter(s => s !== null);
    console.log(`\n=== Summary ===`);
    console.log(`Total procedures: ${allProcIds.length}`);
    console.log(`Procedures with source: ${withSource.length}`);
    console.log(`Procedures showing External Import: ${Object.values(sourceMap).filter(s => s === 'External Import').length}`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
