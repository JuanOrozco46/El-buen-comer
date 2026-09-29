import prisma from "./prisma";

export function getBogotaTimeInfo() {
  const now = new Date();
  const bogotaStr = now.toLocaleString("es-CO", { timeZone: "America/Bogota" });

  // Format YYYY-MM-DD in Colombia timezone
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value || "";
  const month = parts.find((p) => p.type === "month")?.value || "";
  const day = parts.find((p) => p.type === "day")?.value || "";
  const todayStr = `${year}-${month}-${day}`;

  // Time part (HH:mm:ss)
  const timePart = bogotaStr.split(", ")[1] || "00:00:00";
  const [hStr, mStr] = timePart.split(":");
  const hours = parseInt(hStr || "0", 10);
  const minutes = parseInt(mStr || "0", 10);
  const timeValue = hours + minutes / 60;

  return {
    todayStr,
    hStr: hStr || "00",
    mStr: mStr || "00",
    hours,
    minutes,
    timeValue,
  };
}

/**
 * Gets or updates GlobalSettings with automatic daily reset & 30-min auto-close before 6:30 PM (i.e. at 6:00 PM / 18:00).
 */
export async function getOrUpdateGlobalSettings(manualTogglePickupOnly?: boolean) {
  const timeInfo = getBogotaTimeInfo();
  const { todayStr, timeValue } = timeInfo;

  let settings = await (prisma.globalSettings as any).findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await (prisma.globalSettings as any).create({
      data: {
        id: 1,
        isPanicModeActive: false,
        isPickupOnlyActive: false,
        isExtendedTimeActive: false,
        pickupOnlySetDate: todayStr,
        pickupOnlyManualDate: null,
      },
    });
  }

  let isPickupOnlyActive = settings.isPickupOnlyActive;
  let pickupOnlySetDate = settings.pickupOnlySetDate;
  let pickupOnlyManualDate = settings.pickupOnlyManualDate;
  let needsDbUpdate = false;
  let updateData: any = {};

  // Case 1: Manual toggle by Admin
  if (typeof manualTogglePickupOnly === "boolean") {
    isPickupOnlyActive = manualTogglePickupOnly;
    pickupOnlySetDate = todayStr;
    pickupOnlyManualDate = todayStr;

    updateData.isPickupOnlyActive = isPickupOnlyActive;
    updateData.pickupOnlySetDate = pickupOnlySetDate;
    updateData.pickupOnlyManualDate = pickupOnlyManualDate;
    needsDbUpdate = true;
  } else {
    // Case 2: Automatic daily reset & schedule check
    const isNewDay = pickupOnlySetDate !== todayStr;
    const isPast30MinBeforeClosing = timeValue >= 18.0; // 6:00 PM (18:00)

    if (isNewDay) {
      // It's a new day!
      if (!isPast30MinBeforeClosing) {
        // Before 6:00 PM on a new day: RESTORE delivery unless manually manipulated TODAY
        if (pickupOnlyManualDate !== todayStr) {
          isPickupOnlyActive = false;
          pickupOnlySetDate = todayStr;
          pickupOnlyManualDate = null;
          updateData.isPickupOnlyActive = false;
          updateData.pickupOnlySetDate = todayStr;
          updateData.pickupOnlyManualDate = null;
          needsDbUpdate = true;
        }
      } else {
        // Already past 6:00 PM on a new day
        if (pickupOnlyManualDate !== todayStr) {
          isPickupOnlyActive = true;
          pickupOnlySetDate = todayStr;
          pickupOnlyManualDate = null;
          updateData.isPickupOnlyActive = true;
          updateData.pickupOnlySetDate = todayStr;
          updateData.pickupOnlyManualDate = null;
          needsDbUpdate = true;
        }
      }
    } else {
      // Same day as pickupOnlySetDate
      if (isPast30MinBeforeClosing && !isPickupOnlyActive) {
        // Faltando media hora para cerrar (>= 6:00 PM) -> Auto-activate pickup-only mode
        // UNLESS admin explicitly set it to false TODAY
        if (pickupOnlyManualDate !== todayStr) {
          isPickupOnlyActive = true;
          pickupOnlySetDate = todayStr;
          updateData.isPickupOnlyActive = true;
          updateData.pickupOnlySetDate = todayStr;
          needsDbUpdate = true;
        }
      }
    }
  }

  if (needsDbUpdate) {
    settings = await (prisma.globalSettings as any).update({
      where: { id: 1 },
      data: updateData,
    });
  }

  return {
    settings,
    timeInfo,
    isAutoTriggered: timeValue >= 18.0 && settings.pickupOnlyManualDate !== todayStr,
    isManuallySetToday: settings.pickupOnlyManualDate === todayStr,
  };
}
