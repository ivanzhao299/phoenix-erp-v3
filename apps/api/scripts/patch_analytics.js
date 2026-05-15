const fs = require('fs');
const path = '../phoenix-backend/src/routes/analytics.js';

let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  "WHERE date >= date('now', '-30 days')",
  "WHERE date >= date((SELECT MAX(date) FROM pkg_shifts), '-30 days')"
);

code = code.replace(
  "WHERE status IN ('DONE','INBOUND') AND start_time >= date('now', '-30 days')",
  "WHERE status IN ('DONE','INBOUND') AND start_time >= date((SELECT MAX(start_time) FROM pkg_tasks), '-30 days')"
);

code = code.replace(
  "WHERE change_type = 'INBOUND' AND date(created_at) >= date('now', '-30 days')",
  "WHERE change_type = 'INBOUND' AND date(created_at) >= date((SELECT MAX(created_at) FROM inv_ledger), '-30 days')"
);

code = code.replace(
  "WHERE change_type = 'OUTBOUND' AND date(created_at) >= date('now', '-30 days')",
  "WHERE change_type = 'OUTBOUND' AND date(created_at) >= date((SELECT MAX(created_at) FROM inv_ledger), '-30 days')"
);

code = code.replace(
  "AND date(created_at) >= date('now', '-30 days')",
  "AND date(created_at) >= date((SELECT MAX(created_at) FROM ord_orders), '-30 days')"
);

code = code.replace(
  "WHERE shift_date >= date('now', '-14 days')",
  "WHERE shift_date >= date((SELECT MAX(shift_date) FROM pkg_shifts), '-14 days')"
);

code = code.replace(
  /AND date\(created_at\) >= date\('now', '-30 days'\)/g,
  "AND date(created_at) >= date((SELECT MAX(created_at) FROM inv_ledger), '-30 days')"
);

code = code.replace(
  "AND expire_date BETWEEN date('now') AND date('now', '+7 days')",
  "AND expire_date BETWEEN date((SELECT MAX(created_at) FROM inv_batches)) AND date((SELECT MAX(created_at) FROM inv_batches), '+7 days')"
);

code = code.replace(
  "AND expire_date < date('now')",
  "AND expire_date < date((SELECT MAX(created_at) FROM inv_batches))"
);

code = code.replace(
  "AND date(created_at) <= date('now', '-3 days')",
  "AND date(created_at) <= date((SELECT MAX(created_at) FROM ord_orders), '-3 days')"
);

fs.writeFileSync(path, code, 'utf8');
console.log('Analytics patched successfully!');
