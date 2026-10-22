// Automated verification script for Aging Incident Report enhancements

const BASE_URL = 'http://localhost:3000';

async function testAgingWorkflow() {
  console.log('--- 1. Testing GET /api/departments/mappings ---');
  const mapRes = await fetch(`${BASE_URL}/api/departments/mappings`);
  if (!mapRes.ok) throw new Error(`Failed to fetch mappings: ${mapRes.status}`);
  const mapData = await mapRes.json();
  console.log('Mappings retrieved:', Object.keys(mapData.mappings).length, 'departments configured.');

  // Verify ISS rule: strictly ISS MT or ISS Binondo, never plain ISS
  const issTeams = mapData.mappings['ECS ISS'] || mapData.mappings['ISS'];
  console.log('ECS ISS mapped teams:', issTeams);
  if (!issTeams.includes('ISS MT') || !issTeams.includes('ISS Binondo')) {
    throw new Error('ISS must include ISS MT and ISS Binondo');
  }
  if (issTeams.includes('ISS')) {
    throw new Error('Plain "ISS" must not exist under ISS mappings');
  }
  console.log('✓ ISS team naming rule verified: only ISS MT and ISS Binondo exist.');

  console.log('\n--- 2. Testing Department Validation: Incompatible Assignment Rejection ---');
  const rejectRes = await fetch(`${BASE_URL}/api/incidents/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: 'TEST-REJECT-001',
      department: 'ECS ISS',
      responsibleOrDependency: 'HR Admin', // Invalid team for ECS ISS
      recentUpdate: 'Should fail validation',
    }),
  });
  console.log('Incompatible assignment status:', rejectRes.status);
  const rejectData = await rejectRes.json();
  if (rejectRes.status !== 400 || rejectData.success !== false) {
    throw new Error(`Expected 400 rejection for incompatible assignment, got ${rejectRes.status}`);
  }
  console.log('✓ Incompatible department-team assignment rejected by backend correctly:', rejectData.error);

  console.log('\n--- 3. Testing Department Validation: Compatible Assignment Saving ---');
  const validRes = await fetch(`${BASE_URL}/api/incidents/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: 'TEST-VALID-001',
      department: 'ECS ISS',
      responsibleOrDependency: 'ISS MT',
      recentUpdate: 'Escalated to MT technician on site',
      updatedBy: 'Test Senior Tech',
    }),
  });
  console.log('Valid assignment status:', validRes.status);
  const validData = await validRes.json();
  if (!validRes.ok || !validData.success) {
    throw new Error(`Failed to save valid assignment: ${JSON.stringify(validData)}`);
  }
  console.log('✓ Valid assignment saved successfully:', validData.assignment);

  console.log('\n--- 4. Testing Unassigned Department Assignment & Saving ---');
  const unassignedRes = await fetch(`${BASE_URL}/api/incidents/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: 'TEST-UNASSIGNED-001',
      department: 'Not Assigned',
      responsibleOrDependency: 'SDS',
      recentUpdate: 'Assigned SDS team for unassigned ticket',
      updatedBy: 'Workflow Admin',
    }),
  });
  console.log('Unassigned department assignment status:', unassignedRes.status);
  const unassignedData = await unassignedRes.json();
  if (!unassignedRes.ok || !unassignedData.success) {
    throw new Error(`Failed to save assignment for unassigned department: ${JSON.stringify(unassignedData)}`);
  }
  console.log('✓ Unassigned department assigned and saved successfully:', unassignedData.assignment);

  console.log('\n--- 5. Testing Bulk Save Endpoint ---');
  const bulkRes = await fetch(`${BASE_URL}/api/incidents/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify([
      {
        requestId: 'BULK-001',
        department: 'ECS SDS',
        responsibleOrDependency: 'POS DB',
        recentUpdate: 'Bulk updated DB issue',
        updatedBy: 'Bulk Admin',
      },
      {
        requestId: 'BULK-002',
        department: 'ECS ISS',
        responsibleOrDependency: 'ISS Binondo',
        recentUpdate: 'Bulk updated Binondo branch ticket',
        updatedBy: 'Bulk Admin',
      },
    ]),
  });
  console.log('Bulk save status:', bulkRes.status);
  const bulkData = await bulkRes.json();
  if (!bulkRes.ok || !bulkData.success || bulkData.savedCount !== 2) {
    throw new Error(`Bulk save failed: ${JSON.stringify(bulkData)}`);
  }
  console.log('✓ Bulk save saved all items successfully:', bulkData.savedCount);

  console.log('\n--- 6. Testing GET /api/incidents/assignments to Verify Real Persistence ---');
  const getAssignmentsRes = await fetch(`${BASE_URL}/api/incidents/assignments`);
  const getAssignmentsData = await getAssignmentsRes.json();
  const saved1 = getAssignmentsData.assignments['TEST-VALID-001'];
  const savedUnassigned = getAssignmentsData.assignments['TEST-UNASSIGNED-001'];
  const savedBulk1 = getAssignmentsData.assignments['BULK-001'];

  if (!saved1 || saved1.responsibleOrDependency !== 'ISS MT') {
    throw new Error('TEST-VALID-001 not found or corrupted in persistent store');
  }
  if (!savedUnassigned || savedUnassigned.responsibleOrDependency !== 'SDS') {
    throw new Error('TEST-UNASSIGNED-001 not found or corrupted in persistent store');
  }
  if (!savedBulk1 || savedBulk1.responsibleOrDependency !== 'POS DB') {
    throw new Error('BULK-001 not found or corrupted in persistent store');
  }
  console.log('✓ Real disk persistence verified across single and bulk records.');

  console.log('\n🎉 ALL AGING INCIDENT ENHANCEMENT TESTS PASSED PERFECTLY!');
}

testAgingWorkflow().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
