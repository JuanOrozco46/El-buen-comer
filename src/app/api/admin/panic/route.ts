import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../../lib/auth";
import { getOrUpdateGlobalSettings } from "../../../../lib/settings";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { active, pickupOnly, extendedTime } = body;

    let updated: any;
    if (pickupOnly !== undefined) {
      const result = await getOrUpdateGlobalSettings(Boolean(pickupOnly));
      updated = result.settings;
    }

    const data: any = {};
    if (active !== undefined) data.isPanicModeActive = active;
    if (extendedTime !== undefined) data.isExtendedTimeActive = extendedTime;

    if (Object.keys(data).length > 0) {
      updated = await prisma.globalSettings.upsert({
        where: { id: 1 },
        update: data,
        create: { id: 1, ...data }
      }) as any;
    }

    if (!updated) {
      const result = await getOrUpdateGlobalSettings();
      updated = result.settings;
    }

    const currentResult = await getOrUpdateGlobalSettings();

    return NextResponse.json({ 
      isPanicModeActive: currentResult.settings?.isPanicModeActive || false,
      isPickupOnlyActive: currentResult.settings?.isPickupOnlyActive || false,
      isExtendedTimeActive: currentResult.settings?.isExtendedTimeActive || false,
      pickupOnlySetDate: currentResult.settings?.pickupOnlySetDate || null,
      pickupOnlyManualDate: currentResult.settings?.pickupOnlyManualDate || null,
      isAutoTriggered: currentResult.isAutoTriggered,
      isManuallySetToday: currentResult.isManuallySetToday
    });
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const { settings, isAutoTriggered, isManuallySetToday } = await getOrUpdateGlobalSettings();
    return NextResponse.json({ 
      isPanicModeActive: settings?.isPanicModeActive || false,
      isPickupOnlyActive: settings?.isPickupOnlyActive || false,
      isExtendedTimeActive: settings?.isExtendedTimeActive || false,
      pickupOnlySetDate: settings?.pickupOnlySetDate || null,
      pickupOnlyManualDate: settings?.pickupOnlyManualDate || null,
      isAutoTriggered,
      isManuallySetToday
    });
  } catch (error) {
    console.error("Settings fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

