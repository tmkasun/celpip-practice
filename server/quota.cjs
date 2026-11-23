const { createHash } = require("node:crypto");
const { WritingError } = require("./writing.cjs");

const pacificDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
});

function createQuota(db, limits, clock = Date.now) {
  const globalRef = db.collection("writingAiQuota").doc("global");
  const accounts = db.collection("writingAiDaily");

  return async function reserve(uid) {
    const account = createHash("sha256").update(uid).digest("hex");
    return db.runTransaction(async (transaction) => {
      const now = clock();
      const fields = Object.fromEntries(pacificDay.formatToParts(now).map(({ type, value }) => [type, value]));
      const day = [fields.year, fields.month, fields.day].join("-");
      const accountRef = accounts.doc(day + "-" + account);
      const [global, user] = await transaction.getAll(globalRef, accountRef);
      const globalData = global.data();
      const currentMinute = (globalData?.recent ?? []).filter((timestamp) => timestamp > now - 60000);
      const dailyTotal = globalData?.day === day ? globalData.count : 0;
      const accountDaily = user.data()?.count ?? 0;

      if (accountDaily >= limits.accountDaily) throw new WritingError(429, "account_limit");
      if (dailyTotal >= limits.daily) throw new WritingError(429, "daily_limit");
      if (currentMinute.length >= limits.minute) {
        const waitSeconds = Math.max(1, Math.ceil((Math.min(...currentMinute) + 60000 - now) / 1000));
        throw new WritingError(429, "busy", waitSeconds);
      }

      transaction.set(globalRef, { day, count: dailyTotal + 1, recent: [...currentMinute, now] });
      transaction.set(accountRef, { count: accountDaily + 1, expiresAt: new Date(now + 3 * 86400000) });
    });
  };
}

module.exports = { createQuota };
