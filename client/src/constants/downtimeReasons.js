// Mirrors server/src/controllers/downtimeController.js's DOWNTIME_CATEGORIES —
// kept in sync manually since client and server don't share a code module.
// Category order matches the order shown in the mobile downtime-logging sheet.
export const DOWNTIME_CATEGORY_NAMES = [
  'Machine Issues',
  'Material Issues',
  'Power Issues',
  'Operational Issues',
  'Other'
];

export const DOWNTIME_REASONS = {
  'Machine Issues': ['Machine Breakdown', 'Routine Maintenance', 'Electrical Fault', 'Mechanical Fault'],
  'Material Issues': ['Raw Material Shortage', 'Material Quality Rejection', 'Waiting for Material'],
  'Power Issues': ['Power Cut', 'Load Shedding', 'Generator Failure'],
  'Operational Issues': ['Operator Absent', 'Shift Change Delay', 'Safety Inspection'],
  Other: ['Other']
};
