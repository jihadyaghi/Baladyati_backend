const db = require('../config/db');
const DAY_ORDER = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday'
];
function isOpenNow() {// hydi aamlta krml yaaref l mwaten eiza l baladye hl2 mftuha aw laa
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Beirut' })
  );

  const day = now.getDay(); 
  const hour = now.getHours();
  const min = now.getMinutes();
  const time = hour * 60 + min;

  return day >= 1 && day <= 5 && time >= 8 * 60 && time < 15 * 60;
}
function getNextPickup(schedule) {//hydi krml l waste schedule
  if (!schedule || schedule.length === 0) return null;
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Beirut' })
  );
  const todayIdx = now.getDay();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const candidates = schedule.map((entry) => {
  const entryDayIdx = DAY_ORDER.indexOf(entry.day_of_week);
  const timeStr = String(entry.pickup_time);
  const [h, m] = timeStr.split(':').map(Number);
  const entryMins = h * 60 + m;
    let daysAhead = entryDayIdx - todayIdx;
    if (daysAhead < 0) daysAhead += 7;
    if (daysAhead === 0 && entryMins <= nowMins) daysAhead += 7;
    const pickupDate = new Date(now);
    pickupDate.setDate(now.getDate() + daysAhead);
    return { daysAhead, entry, pickupDate };
  });
  candidates.sort((a, b) => a.daysAhead - b.daysAhead);
  const next = candidates[0];
  if (!next) return null;
  return {
    dayOfWeek: next.entry.day_of_week,
    pickupTime: next.entry.pickup_time,
    date: next.pickupDate.toISOString().split('T')[0],
    daysFromNow: next.daysAhead,
  };
}
exports.getHomeData = async (req, res) => {
  try {
    const citizenId = req.citizenId;
    const [citizenRows] = await db.execute( //hydi l query btruh aal table citizens and zones
      `SELECT 
         c.id,
         c.first_name,
         c.last_name,
         c.phone,
         c.zone_id,
         z.zone_name
       FROM citizens c
       LEFT JOIN zones z ON c.zone_id = z.zone_id 
       WHERE c.id = ?
       LIMIT 1`,
      [citizenId] //lech staamlna JOIN zones l2n b table citizens aandu bs zone_id w nhna bdna zone_name l hk htyna JOIN
    );
    if (citizenRows.length === 0) { // eiza m fi mwaten ha yrja3 not found
      return res.status(404).json({
        success: false,
        message: 'Citizen not found.'
      });
    }
    const citizen = citizenRows[0];
    const municipalityInfo = { //hydi information sebte lal baladye 
      name: 'Betormaz Municipality',
      nameArabic: 'بلدية بطرماز - الضنية',
      district: 'Dinniyeh District · North Lebanon',
      phone: '+961 06 123 456',
      workingHours: 'Mon - Fri · 08:00 - 15:00',
      isOpenNow: isOpenNow()
    };
    const [wasteRows] = await db.execute( // hydi l query krml njib mn table l waste_schedule yaani kl citizen rah ychuf schedule l khas b mnt2tu
      `SELECT 
         day_of_week,
         pickup_time
       FROM waste_schedule
       WHERE zone_id = ?
       ORDER BY FIELD(
         day_of_week,
         'monday','tuesday','wednesday',
         'thursday','friday','saturday','sunday'
       )`,
      [citizen.zone_id]
    );
    const nextPickup = getNextPickup(wasteRows);
    const [[{ totalRequests }]] = await db.execute( // hydi krml l stats
      `SELECT COUNT(*) AS totalRequests
       FROM requests
       WHERE citizen_id = ?`,
      [citizenId]
    );
    const [[{ openIssues }]] = await db.execute(
      `SELECT COUNT(*) AS openIssues
       FROM requests
       WHERE citizen_id = ?
         AND type = 'ISSUE'
         AND status IN ('PENDING', 'IN_PROGRESS', 'IN_REVIEW')`,
      [citizenId]
    );
    const [[{ resolved }]] = await db.execute(
      `SELECT COUNT(*) AS resolved
       FROM requests
       WHERE citizen_id = ?
         AND status IN ('APPROVED', 'DONE', 'RESOLVED')`,
      [citizenId]
    );
    const [[{ unreadNotifications }]] = await db.execute(
      `SELECT COUNT(*) AS unreadNotifications
       FROM notifications
       WHERE citizen_id = ? AND is_read = 0`,
      [citizenId]
    );
    return res.status(200).json({
      success: true,
      data: {
        citizen: { // information l ctitizen l asesye
          id: citizen.id,
          firstName: citizen.first_name,
          lastName: citizen.last_name,
          zone: citizen.zone_name
        },
        municipality: municipalityInfo, // information l baladye
        wasteSchedule: {
          zone: citizen.zone_name,
          schedule: wasteRows,
          nextPickup: nextPickup
        },
        stats: { 
          totalRequests: Number(totalRequests),
          openIssues: Number(openIssues),
          resolved: Number(resolved)
        },
        unreadNotifications: Number(unreadNotifications)
      }
    });
  } 
  catch (err) {
    console.error('[homeController.getHomeData]', err);
    return res.status(500).json({
      success: false,
      message: 'Could not load home data.'
    });
  }
};