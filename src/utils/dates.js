const { tzOffsetMin } = require('../config');
// Calendar days (YYYY-MM-DD, campus time) covered by [from, to], Sundays skipped.
function dayKeys(from, to) {
  const shift = d => new Date(new Date(d).getTime() + tzOffsetMin * 60000);
  const s = shift(from), e = shift(to);
  const cur = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const end = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), e.getUTCDate()));
  const out = [];
  while (cur <= end) {
    if (cur.getUTCDay() !== 0) out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
function durationText(from, to) {
  const h = Math.round((new Date(to) - new Date(from)) / 36e5);
  return h >= 24 ? `${Math.floor(h / 24)} day(s) ${h % 24 ? (h % 24) + ' h' : ''}`.trim() : `${h} hour(s)`;
}
module.exports = { dayKeys, durationText };
