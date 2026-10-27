/* Loads demo data. Usage: npm run seed   (WARNING: clears all collections) */
const bcrypt = require('bcryptjs');
const connectDB = require('../src/config/db');
const { subjects } = require('../src/config');
const { dayKeys } = require('../src/utils/dates');
const M = n => require('../src/models/' + n);
const svc = require('../src/services/requestService');

const DEMO_PASSWORD = 'Demo@1234';
const ADMIN_PASSWORD = 'Admin@1234';

function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const at = (off, h) => { const d = new Date(); d.setDate(d.getDate() + off); d.setHours(h, 0, 0, 0); return d.toISOString(); };

async function seedData() {
  for (const n of ['User', 'Parent', 'Student', 'ODRequest', 'Approval', 'HostelExit', 'Attendance', 'Notification', 'AuditLog', 'Counter', 'OtpCode']) await M(n).deleteMany({});
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10), adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const mk = (name, email, role, passwordHash = hash) => M('User').create({ name, email, role, passwordHash, emailVerified: true });

  const admin = await mk('Admin Office', 'admin@campus.edu', 'Admin', adminHash);
  const faculty = await mk('Ms. Nagamani Segalla', 'faculty@campus.edu', 'Faculty');
  await mk('Hostel Warden', 'warden@campus.edu', 'Warden');

  const people = [
    { name: 'Govinth S', key: 'govinth', roll: 'CSE-101', hostel: true, absent: 0.10 },
    { name: 'Ananya R', key: 'ananya', roll: 'CSE-102', hostel: false, absent: 0.06 },
    { name: 'Karthik M', key: 'karthik', roll: 'CSE-103', hostel: true, absent: 0.14 },
  ];
  const students = {};
  for (const p of people) {
    const pu = await mk(`Parent of ${p.name}`, `parent.${p.key}@campus.edu`, 'Parent');
    const parent = await M('Parent').create({ user: pu._id, email: pu.email });
    const su = await mk(p.name, `${p.key}@campus.edu`, 'Student');
    students[p.key] = { user: su, parentUser: pu, doc: await M('Student').create({ user: su._id, rollNo: p.roll, department: 'CSE', year: 3, isHosteller: p.hostel, parent: parent._id, advisor: faculty._id }) };
    // 5 weeks of attendance history
    const r = rng(p.name.length * 977), rows = [];
    for (const date of dayKeys(at(-35, 9), at(-1, 9))) for (const subject of subjects)
      rows.push({ student: students[p.key].doc._id, date, subject, status: r() < p.absent ? 'Absent' : 'Present' });
    await M('Attendance').insertMany(rows);
  }
  const S = k => students[k];
  const apply = (k, d) => svc.createRequest(S(k).user, S(k).doc, d);

  // Past decided requests
  const a = await apply('govinth', { type: 'OD', eventName: 'Inter-college Symposium', reason: 'Presenting a paper on campus automation.', location: 'PSG Tech, Coimbatore', fromTime: at(-6, 9), toTime: at(-5, 17) });
  await svc.acknowledge(S('govinth').parentUser, a._id, [S('govinth').doc._id]);
  await svc.decide(faculty, a._id, 'Approved', 'Approved. Submit the participation certificate.');
  const b = await apply('govinth', { type: 'Leave', eventName: 'Family function', reason: "Cousin's wedding in Madurai.", location: 'Madurai', fromTime: at(-14, 8), toTime: at(-12, 20) });
  await svc.decide(faculty, b._id, 'Rejected', 'Internal exams on those dates. Apply for a later date.');
  const c = await apply('karthik', { type: 'OD', eventName: 'Workshop on Cloud Computing', reason: 'Skill workshop organised by the department.', location: 'Seminar Hall, Block B', fromTime: at(2, 9), toTime: at(2, 17) });
  await svc.decide(faculty, c._id, 'Approved', 'Approved.');
  // Pending
  await apply('karthik', { type: 'OD', eventName: 'State Hackathon', reason: 'Representing the college in a 24-hour hackathon.', location: 'Anna University, Chennai', fromTime: at(1, 9), toTime: at(2, 9) });
  await apply('ananya', { type: 'Leave', eventName: 'Medical appointment', reason: 'Scheduled dental procedure.', location: 'City Dental Clinic', fromTime: at(1, 10), toTime: at(1, 16) });
  return { admin };
}
module.exports = { seedData, DEMO_PASSWORD, ADMIN_PASSWORD };

if (require.main === module) {
  (async () => {
    await connectDB();
    await seedData();
    console.log(`Seeded.\n  admin@campus.edu / ${ADMIN_PASSWORD}\n  faculty@campus.edu, warden@campus.edu, govinth@campus.edu, ananya@campus.edu,\n  karthik@campus.edu, parent.govinth@campus.edu ... / ${DEMO_PASSWORD}`);
    process.exit(0);
  })().catch(e => { console.error(e); process.exit(1); });
}
