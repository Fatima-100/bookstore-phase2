const labels = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' };

export default function StatusBadge({ status }) {
  return <span className={`status-badge ${status}`}>{labels[status] || status}</span>;
}
