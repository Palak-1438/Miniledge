export function formatMoney(amount: string): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `₹${amount}`;
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' -> '23 Oct 2026' (no Date parsing, so no timezone shifts). */
export function formatDueDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const month = MONTHS[Number(m) - 1];
  if (!y || !m || !d || !month) return iso;
  return `${Number(d)} ${month} ${y}`;
}

/** Local calendar date -> 'YYYY-MM-DD' (not toISOString(), which converts to UTC and can shift the day). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 3)} ••••• ${phone.slice(-4)}` : phone;
}
