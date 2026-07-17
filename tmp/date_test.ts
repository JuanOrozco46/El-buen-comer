import { startOfDay, endOfDay, subDays, startOfWeek, startOfMonth } from "date-fns";

const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
console.log("now:", now);
console.log("startOfDay(now):", startOfDay(now));
console.log("endOfDay(now):", endOfDay(now));

const from = "2026-07-17";
const toDate = new Date(from);
toDate.setUTCHours(23, 59, 59, 999);
console.log("toDate (setUTCHours):", toDate);
