export default function UrgencyBadge({ level }) {
  const normalized = String(level || 'MEDIUM').toUpperCase();
  const cls = normalized === 'HIGH' ? 'urgency-high' : normalized === 'LOW' ? 'urgency-low' : 'urgency-medium';
  return <span className={`urgency-badge ${cls}`}>{normalized}</span>;
}
