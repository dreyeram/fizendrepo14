const { searchPatients } = require('./app/actions/auth');

async function main() {
  const result = await searchPatients('');
  if (result.success) {
    const patientsWithSource = result.patients.filter(p => 
      p.procedures && p.procedures.some(pr => pr.source === 'External Import')
    );
    console.log("Patients with External Import source:", patientsWithSource.length);
    if (patientsWithSource.length > 0) {
      console.log("First patient procedure source:", patientsWithSource[0].procedures[0].source);
    } else {
      console.log("No patients found with External Import source in the results.");
      console.log("Sample procedure from first patient:", result.patients[0].procedures[0]);
    }
  } else {
    console.error("searchPatients failed:", result.error);
  }
}

main().catch(console.error);
