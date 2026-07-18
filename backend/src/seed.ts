import { execSync } from 'child_process';
import { PrismaClient, Role, StaffStatus, TableStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export async function seedDatabaseIfEmpty(prisma: PrismaClient) {
  // Automatically run prisma db push to ensure tables exist in the database
  try {
    console.log('Ensuring database tables exist (running prisma db push)...');
    execSync('node node_modules/prisma/build/index.js db push', {
      stdio: 'inherit',
      env: process.env,
    });
    console.log('Database tables verified/created successfully.');
  } catch (pushErr) {
    console.error('Failed to run automatic database schema push:', pushErr);
  }

  const staffCount = await prisma.staff.count();
  if (staffCount > 0) {
    return;
  }

  console.log('No staff profiles found. Seeding database...');

  // 1. Create Default Restaurant Settings if not present
  const settings = await prisma.restaurantSettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'Cafe Cue & Brew',
      tagline: 'Cue for coffee, brew for conversations',
      address: '123 Gourmet Street, Foodie Zone',
      phone: '+919999999999',
      whatsAppNumber: '+919999999999',
      email: 'contact@cafecuebrew.com',
      openingTime: '09:00',
      closingTime: '23:00',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      
      // Billing Defaults
      enableCash: true,
      enableUpi: true,
      enableCard: true,
      enableCredit: true,
      enableRoundOff: true,
      enableServiceCharge: false,
      serviceChargePercentage: 0.0,
      invoicePrefix: 'CCB',
      
      // GST Defaults
      enableGst: true,
      gstPercentage: 5.0,
      cgstPercentage: 2.5,
      sgstPercentage: 2.5,
      gstin: '27AAAAA1111A1Z1',
      taxInclusivePricing: true,
      
      // Night Charges Defaults
      enableNightCharges: false,
      nightStart: '23:00',
      nightEnd: '05:00',
      nightChargeType: 'PERCENTAGE',
      nightChargeValue: 10.0,
      
      // Discount Limit Settings
      cashierMaxDiscountPercent: 10.00,
      managerMaxDiscountPercent: 25.00,
      managerCanViewFinancialAnalytics: false,
      managerCanViewFinancialReports: false,
      
      // Order settings
      qrOrderingEnabled: true,
      requireCustomerName: true,
      requireCustomerPhone: true,
      manualAcceptQrOrders: true,
      allowCustomerNotes: true,
      allowAddons: true,
      allowCustomerCancellation: false,
      customerCancellationTimeLimit: 120,
      trackOrderTimeline: true,
      trackStaffActions: true,
      trackCancellationReasons: true,
      trackOrderSource: true,
      
      // Digital Menu defaults
      enableQrMenu: true,
      showOfferCarousel: true,
      carouselRotationSeconds: 5,
      showPopularItems: true,
      showBestSellers: true,
      showRecommendedItems: true,
      showPreparationTime: true,
      showVegNonVeg: true,
      showUnavailableItems: true,
      enableCallWaiter: true,
      
      // Security defaults
      pinLength: 4,
      sessionTimeout: 720,
      maxFailedAttempts: 5,
      accountLockDuration: 15,
      trackLoginHistory: true,
      trackStaffActivity: true,
      
      // Notification defaults
      enableNewOrderSound: true,
      enableWaiterCallSound: true,
      enableLowStockAlerts: true,
      newOrderPollInterval: 3,
      waiterCallPollInterval: 3,
      customerOrderStatusPollInterval: 5,
      ownerDashboardRefreshInterval: 15,
    },
  });

  console.log('Default settings verified:', settings.name);

  // 2. Create default Owner if not present
  const ownerPhone = '+919999999999';
  const existingOwner = await prisma.staff.findUnique({
    where: { phone: ownerPhone },
  });

  if (!existingOwner) {
    const pinHash = await bcrypt.hash('1234', 10);
    const owner = await prisma.staff.create({
      data: {
        name: 'Owner',
        phone: ownerPhone,
        role: Role.OWNER,
        pinHash,
        mustChangePin: true,
        status: StaffStatus.ACTIVE,
      },
    });
    console.log('Default Owner created! ID:', owner.id, 'PIN: 1234');
  }

  // 3. Create default tables if not present
  const tableNumbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  for (const num of tableNumbers) {
    const tableNumStr = `Table ${num}`;
    const table = await prisma.restaurantTable.upsert({
      where: { tableNumber: tableNumStr },
      update: {},
      create: {
        tableNumber: tableNumStr,
        capacity: 4,
        status: TableStatus.AVAILABLE,
        isActive: true,
      },
    });

    await prisma.tableQrToken.upsert({
      where: { tableId: table.id },
      update: {},
      create: {
        tableId: table.id,
        token: `TOKEN_TABLE_${num}_` + Math.random().toString(36).substring(2, 10).toUpperCase(),
      },
    });
  }
  console.log('Sample Tables (1-10) verified.');
  console.log('Database seeding completed successfully!');
}
