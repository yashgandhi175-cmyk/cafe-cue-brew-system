import { PrismaClient, Role, StaffStatus, TableStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

interface SeedItem {
  name: string;
  category: string;
  basePrice: number;
  description: string;
  isVeg: boolean;
  prepTime?: number;
  popular?: boolean;
  recommended?: boolean;
  bestSeller?: boolean;
  variants?: Array<{ name: string; price: number }>;
}

export async function seedDatabaseIfEmpty(prisma: PrismaClient) {
  const settingsCount = await prisma.restaurantSettings.count();
  const staffCount = await prisma.staff.count();
  const categoryCount = await prisma.category.count();
  const menuItemCount = await prisma.menuItem.count();

  if (
    settingsCount > 0 &&
    staffCount > 0 &&
    categoryCount > 0 &&
    menuItemCount > 0
  ) {
    return;
  }

  console.log('Database missing core records. Running seeder...');

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
      cashierMaxDiscountPercent: 10.0,
      managerMaxDiscountPercent: 25.0,
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

  if (staffCount === 0 && !existingOwner) {
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
        token:
          `TOKEN_TABLE_${num}_` +
          Math.random().toString(36).substring(2, 10).toUpperCase(),
      },
    });
  }
  console.log('Sample Tables (1-10) verified.');

  // 4. Create dummy ingredient for empty recipe links
  const dummyIngredient = await prisma.ingredient.upsert({
    where: { name: 'Placeholder Food Ingredient' },
    update: {},
    create: {
      name: 'Placeholder Food Ingredient',
      unit: 'PCS',
      category: 'OTHER',
      currentStock: 0.0,
      minimumStock: 0.0,
      reorderLevel: 0.0,
      isActive: true,
    },
  });

  // 5. Seed categories in exact order
  const categoryNames = [
    'Starters',
    'Momos',
    'Sandwich',
    'Burger',
    'Pizza',
    'Fries',
    'Maggie',
    'Sizzling',
    'Freyo Tower',
    'Mojito',
    'Cold Beverages',
    'Hot Beverage',
    'Chocolate Fun',
    'Milkshakes',
  ];

  const categoryMap: Record<string, string> = {};
  for (let i = 0; i < categoryNames.length; i++) {
    const catName = categoryNames[i];
    const cat = await prisma.category.upsert({
      where: { name: catName },
      update: { displayOrder: i + 1 },
      create: {
        name: catName,
        displayOrder: i + 1,
        isActive: true,
      },
    });
    categoryMap[catName] = cat.id;
  }

  // 6. Define menu items
  const menuItems: SeedItem[] = [
    // --- Starters ---
    {
      name: 'Garlic Bread',
      category: 'Starters',
      basePrice: 80,
      description: 'Crispy garlic bread brushed with butter and herbs.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Bread Pizza',
      category: 'Starters',
      basePrice: 80,
      description:
        'Crispy bread slices topped with pizza sauce, veggies, and melted cheese.',
      isVeg: true,
      prepTime: 10,
    },
    {
      name: 'Cheese Chilli Toast',
      category: 'Starters',
      basePrice: 110,
      description:
        'Toasted bread topped with spicy chillies and melted cheese.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Cheese Nachos',
      category: 'Starters',
      basePrice: 140,
      description: 'Crispy tortilla chips topped with warm cheese sauce.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Mexican Cheese Nachos',
      category: 'Starters',
      basePrice: 160,
      description: 'Nachos loaded with Mexican spices, salsa, and cheese.',
      isVeg: true,
      prepTime: 10,
    },

    // --- Momos ---
    {
      name: 'Regular Momos',
      category: 'Momos',
      basePrice: 70,
      description: 'Delicious steamed dumplings served with red chilli sauce.',
      isVeg: true,
      prepTime: 12,
      variants: [
        { name: 'Veg', price: 70 },
        { name: 'Non Veg', price: 80 },
      ],
    },
    {
      name: 'Tandoori Momos',
      category: 'Momos',
      basePrice: 80,
      description:
        'Steamed dumplings marinated in tandoori spices and grilled.',
      isVeg: true,
      prepTime: 15,
      variants: [
        { name: 'Veg', price: 80 },
        { name: 'Non Veg', price: 90 },
      ],
    },
    {
      name: 'Peri Peri Momos',
      category: 'Momos',
      basePrice: 90,
      description: 'Dumplings tossed in spicy and zesty peri peri seasoning.',
      isVeg: true,
      prepTime: 15,
      variants: [
        { name: 'Veg', price: 90 },
        { name: 'Non Veg', price: 100 },
      ],
    },
    {
      name: 'Schezwan Momos',
      category: 'Momos',
      basePrice: 90,
      description: 'Steamed dumplings tossed in fiery schezwan sauce.',
      isVeg: true,
      prepTime: 15,
      variants: [
        { name: 'Veg', price: 90 },
        { name: 'Non Veg', price: 100 },
      ],
    },

    // --- Sandwich ---
    {
      name: 'Onion Cheese Sandwich',
      category: 'Sandwich',
      basePrice: 70,
      description:
        'Simple yet delicious grilled sandwich with onions and cheese.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Corn Sandwich',
      category: 'Sandwich',
      basePrice: 80,
      description: 'Sweet corn and cream filled grilled sandwich.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Onion Capsicum Sandwich',
      category: 'Sandwich',
      basePrice: 80,
      description:
        'Grilled sandwich with crunchy onions, capsicum, and cheese.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Veg Cheese Sandwich',
      category: 'Sandwich',
      basePrice: 100,
      description:
        'Classic grilled sandwich filled with fresh vegetables and cheese.',
      isVeg: true,
      prepTime: 10,
    },
    {
      name: 'Chocolate Sandwich',
      category: 'Sandwich',
      basePrice: 110,
      description: 'Sweet dessert sandwich filled with rich melted chocolate.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Tandoori Veg Sandwich',
      category: 'Sandwich',
      basePrice: 120,
      description: 'Grilled veg sandwich with tandoori spiced spread.',
      isVeg: true,
      prepTime: 10,
    },
    {
      name: 'Paneer Tandoori Sandwich',
      category: 'Sandwich',
      basePrice: 140,
      description:
        'Grilled sandwich loaded with tandoori marinated paneer blocks.',
      isVeg: true,
      prepTime: 12,
    },
    {
      name: 'Peri Peri Paneer Sandwich',
      category: 'Sandwich',
      basePrice: 140,
      description: 'Grilled sandwich featuring fiery peri peri paneer.',
      isVeg: true,
      prepTime: 12,
    },
    {
      name: 'Burger Sandwich',
      category: 'Sandwich',
      basePrice: 130,
      description: 'Unique fusion of burger patty inside a grilled sandwich.',
      isVeg: true,
      prepTime: 12,
      variants: [
        { name: 'Veg', price: 130 },
        { name: 'Non Veg', price: 150 },
      ],
    },

    // --- Burger ---
    {
      name: 'Reg Cheese Burger',
      category: 'Burger',
      basePrice: 80,
      description: 'Classic cheeseburger with veg or non-veg patty options.',
      isVeg: true,
      prepTime: 10,
      variants: [
        { name: 'Veg', price: 80 },
        { name: 'Non Veg', price: 100 },
      ],
    },
    {
      name: 'Cheese Burger',
      category: 'Burger',
      basePrice: 100,
      description: 'Rich and cheesy burger topped with cheese slice.',
      isVeg: true,
      prepTime: 10,
      variants: [
        { name: 'Veg', price: 100 },
        { name: 'Non Veg', price: 120 },
      ],
    },
    {
      name: 'Double Cheese Burger',
      category: 'Burger',
      basePrice: 110,
      description: 'Double cheese slice burger for extra cheesiness.',
      isVeg: true,
      prepTime: 10,
      variants: [
        { name: 'Veg', price: 110 },
        { name: 'Non Veg', price: 130 },
      ],
    },
    {
      name: 'Cafe Special Double Patty Burger',
      category: 'Burger',
      basePrice: 150,
      description: 'Chef special burger featuring double patties.',
      isVeg: true,
      prepTime: 12,
      variants: [
        { name: 'Veg', price: 150 },
        { name: 'Non Veg', price: 170 },
      ],
    },

    // --- Pizza ---
    {
      name: 'Cheese Chilli Pizza',
      category: 'Pizza',
      basePrice: 100,
      description: 'Pizza topped with warm cheese and spicy green chillies.',
      isVeg: true,
      prepTime: 15,
    },
    {
      name: 'Margherita Pizza',
      category: 'Pizza',
      basePrice: 110,
      description: 'Classic Italian pizza with simple cheese and tomato sauce.',
      isVeg: true,
      prepTime: 12,
    },
    {
      name: 'Onion Capsicum Pizza',
      category: 'Pizza',
      basePrice: 110,
      description: 'Pizza topped with red onions and green capsicum.',
      isVeg: true,
      prepTime: 15,
    },
    {
      name: 'Tomato Onion Pizza',
      category: 'Pizza',
      basePrice: 110,
      description: 'Topped with fresh tomato slices and chopped onions.',
      isVeg: true,
      prepTime: 15,
    },
    {
      name: 'Double Cheese Pizza',
      category: 'Pizza',
      basePrice: 120,
      description: 'Extra loaded mozzarella cheese pizza.',
      isVeg: true,
      prepTime: 15,
    },
    {
      name: 'Golden Corn Pizza',
      category: 'Pizza',
      basePrice: 130,
      description: 'Sweet golden corn pizza with thick cheese base.',
      isVeg: true,
      prepTime: 15,
    },
    {
      name: 'Fresh Veggie Pizza',
      category: 'Pizza',
      basePrice: 130,
      description:
        'Pizza loaded with a colorful mix of garden-fresh vegetables.',
      isVeg: true,
      prepTime: 15,
    },
    {
      name: 'Paneer Tandoori Pizza',
      category: 'Pizza',
      basePrice: 140,
      description: 'Fusion pizza topped with smoky tandoori paneer tikka.',
      isVeg: true,
      prepTime: 18,
    },
    {
      name: 'Double Cheese Golden Corn Pizza',
      category: 'Pizza',
      basePrice: 140,
      description: 'Double cheese pizza loaded with golden corn kernels.',
      isVeg: true,
      prepTime: 15,
    },
    {
      name: 'Peri Peri Paneer Pizza',
      category: 'Pizza',
      basePrice: 150,
      description: 'Spicy pizza topped with peri peri spiced paneer cubes.',
      isVeg: true,
      prepTime: 18,
    },

    // --- Fries ---
    {
      name: 'Regular Fries',
      category: 'Fries',
      basePrice: 70,
      description: 'Classic salted potato French fries.',
      isVeg: true,
      prepTime: 7,
    },
    {
      name: 'Peri Peri Fries',
      category: 'Fries',
      basePrice: 100,
      description: 'French fries dusted with hot peri peri seasoning.',
      isVeg: true,
      prepTime: 7,
    },
    {
      name: 'Chatpata Fries',
      category: 'Fries',
      basePrice: 110,
      description: 'Fries seasoned with tangy Indian chaat masala.',
      isVeg: true,
      prepTime: 7,
    },
    {
      name: 'Cheese Peri Peri Fries',
      category: 'Fries',
      basePrice: 130,
      description: 'Peri peri fries drizzled with cheese sauce.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Cheese Chatpata Fries',
      category: 'Fries',
      basePrice: 130,
      description: 'Tangy chatpata fries loaded with melted cheese.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Cheese Fries (Reg/Melted)',
      category: 'Fries',
      basePrice: 120,
      description: 'French fries loaded with regular or hot melted cheese.',
      isVeg: true,
      prepTime: 8,
      variants: [
        { name: 'Regular', price: 120 },
        { name: 'Loaded', price: 140 },
      ],
    },

    // --- Maggie ---
    {
      name: 'Plain Maggie',
      category: 'Maggie',
      basePrice: 60,
      description:
        'Simplicity at its best - classic plain yellow instant noodles.',
      isVeg: true,
      prepTime: 7,
    },
    {
      name: 'Masala Maggie',
      category: 'Maggie',
      basePrice: 70,
      description: 'Instant noodles prepared with extra aromatic spices.',
      isVeg: true,
      prepTime: 7,
    },
    {
      name: 'Schezwan Maggie',
      category: 'Maggie',
      basePrice: 70,
      description: 'Noodles tossed in spicy schezwan sauce.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Vegetable Maggie',
      category: 'Maggie',
      basePrice: 80,
      description: 'Maggie loaded with fresh green vegetables.',
      isVeg: true,
      prepTime: 9,
    },
    {
      name: 'Cheese Maggie',
      category: 'Maggie',
      basePrice: 80,
      description: 'Cheesy instant noodles topped with grated cheese.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Peri Peri Maggie',
      category: 'Maggie',
      basePrice: 80,
      description: 'Instant noodles with a fiery peri peri kick.',
      isVeg: true,
      prepTime: 8,
    },
    {
      name: 'Cheese Peri Peri Maggie',
      category: 'Maggie',
      basePrice: 100,
      description: 'Spicy peri peri noodles loaded with cheese.',
      isVeg: true,
      prepTime: 9,
    },
    {
      name: 'Peri Peri Paneer Maggie',
      category: 'Maggie',
      basePrice: 120,
      description:
        'Premium instant noodles with peri peri spice and paneer chunks.',
      isVeg: true,
      prepTime: 10,
    },

    // --- Sizzling ---
    {
      name: 'Sizzling Brownie',
      category: 'Sizzling',
      basePrice: 150,
      description: 'Decadent sizzling chocolate brownie with ice cream.',
      isVeg: true,
      prepTime: 10,
      popular: true,
      recommended: true,
    },
    {
      name: 'Sizzling Burger',
      category: 'Sizzling',
      basePrice: 150,
      description: 'Sizzling patty burger with variants.',
      isVeg: true,
      prepTime: 12,
      popular: true,
      recommended: true,
      variants: [
        { name: 'Veg', price: 150 },
        { name: 'Non Veg', price: 170 },
      ],
    },

    // --- Freyo Tower ---
    {
      name: 'Freyo Tower',
      category: 'Freyo Tower',
      basePrice: 180,
      description: 'Customize Eat and Sip Dish',
      isVeg: true,
      prepTime: 15,
      popular: true,
      recommended: true,
      bestSeller: true,
    },

    // --- Mojito ---
    {
      name: 'Lemon Mojito',
      category: 'Mojito',
      basePrice: 80,
      description: 'Classic refreshing lemon and mint mojito.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Green Apple Mojito',
      category: 'Mojito',
      basePrice: 100,
      description: 'Zesty green apple flavor blended with mint and soda.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Pineapple Mojito',
      category: 'Mojito',
      basePrice: 100,
      description: 'Sweet pineapple juice with mint and refreshing soda.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Ocean Blue Mojito',
      category: 'Mojito',
      basePrice: 120,
      description: 'Cool blue curacao syrup with mint, lime, and soda.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Spicy Guava Mojito',
      category: 'Mojito',
      basePrice: 120,
      description: 'Sweet guava juice with a spicy kick of chilli and lime.',
      isVeg: true,
      prepTime: 5,
    },

    // --- Cold Beverages ---
    {
      name: 'Reg. Cold Coffee',
      category: 'Cold Beverages',
      basePrice: 50,
      description: 'Regular classic blended cold coffee.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Peach Ice Tea',
      category: 'Cold Beverages',
      basePrice: 50,
      description: 'Chilled iced tea flavored with sweet peach.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Lemon Ice Tea',
      category: 'Cold Beverages',
      basePrice: 50,
      description: 'Refreshing iced tea infused with lemon juice.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Thick Cold Coffee',
      category: 'Cold Beverages',
      basePrice: 60,
      description: 'Thick and creamy blended cold coffee.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Thick Cold Coffee with Crush',
      category: 'Cold Beverages',
      basePrice: 70,
      description: 'Thick cold coffee with chocolate/cookie crush.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Chocolate Cold Coffee',
      category: 'Cold Beverages',
      basePrice: 70,
      description: 'Rich chocolate flavored cold coffee.',
      isVeg: true,
      prepTime: 5,
    },
    {
      name: 'Irish Cold Coffee',
      category: 'Cold Beverages',
      basePrice: 80,
      description: 'Aromatic cold coffee with Irish cream syrup.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Caramel Coffee',
      category: 'Cold Beverages',
      basePrice: 80,
      description: 'Creamy cold coffee blended with sweet caramel sauce.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Hazelnut Cold Coffee',
      category: 'Cold Beverages',
      basePrice: 90,
      description: 'Hazelnut syrup infused cold coffee blend.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Chocolate Cold Coffee with Crush',
      category: 'Cold Beverages',
      basePrice: 90,
      description: 'Chocolate cold coffee with cookie crush.',
      isVeg: true,
      prepTime: 6,
    },

    // --- Hot Beverage ---
    {
      name: 'Black Coffee',
      category: 'Hot Beverage',
      basePrice: 25,
      description: 'Strong freshly brewed black coffee.',
      isVeg: true,
      prepTime: 4,
    },
    {
      name: 'Green Tea',
      category: 'Hot Beverage',
      basePrice: 30,
      description: 'Healthy and refreshing steamed green tea leaves.',
      isVeg: true,
      prepTime: 4,
    },
    {
      name: 'Hot Coffee',
      category: 'Hot Beverage',
      basePrice: 30,
      description: 'Classic hot milk coffee.',
      isVeg: true,
      prepTime: 4,
    },
    {
      name: 'Lemon Tea',
      category: 'Hot Beverage',
      basePrice: 30,
      description: 'Charmed hot tea with a squeeze of fresh lemon.',
      isVeg: true,
      prepTime: 4,
    },
    {
      name: 'Hot Chocolate',
      category: 'Hot Beverage',
      basePrice: 70,
      description: 'Rich, warm, and creamy chocolate milk drink.',
      isVeg: true,
      prepTime: 6,
    },

    // --- Chocolate Fun ---
    {
      name: 'White Chocolate',
      category: 'Chocolate Fun',
      basePrice: 80,
      description: 'Blended milk beverage with sweet white chocolate.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Oreo Shake',
      category: 'Chocolate Fun',
      basePrice: 100,
      description: 'Milkshake blended with crunchy Oreo cookies.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Kitkat Shake',
      category: 'Chocolate Fun',
      basePrice: 100,
      description: 'Blended milkshake with KitKat wafer bars.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Day Night Chocolate',
      category: 'Chocolate Fun',
      basePrice: 100,
      description: 'Special blend of white and dark chocolate beverage.',
      isVeg: true,
      prepTime: 6,
    },

    // --- Milkshakes ---
    {
      name: 'Mango',
      category: 'Milkshakes',
      basePrice: 80,
      description: 'Sweet and creamy mango milkshake.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Butterscotch',
      category: 'Milkshakes',
      basePrice: 80,
      description: 'Rich butterscotch shake with crunchies.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Vanilla',
      category: 'Milkshakes',
      basePrice: 80,
      description: 'Smooth classic vanilla milkshake.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Strawberry',
      category: 'Milkshakes',
      basePrice: 80,
      description: 'Creamy and refreshing strawberry milkshake.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Pineapple',
      category: 'Milkshakes',
      basePrice: 80,
      description: 'Sweet pineapple milkshake.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Rose',
      category: 'Milkshakes',
      basePrice: 100,
      description: 'Sweet fragrant rose syrup milkshake.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Chocolate',
      category: 'Milkshakes',
      basePrice: 100,
      description: 'All-time favorite chocolate milkshake.',
      isVeg: true,
      prepTime: 6,
    },
    {
      name: 'Pista',
      category: 'Milkshakes',
      basePrice: 100,
      description: 'Milkshake flavored with rich pistachio nuts.',
      isVeg: true,
      prepTime: 6,
    },
  ];

  const foodCategories = new Set([
    'Pizza',
    'Burger',
    'Sandwich',
    'Momos',
    'Fries',
    'Maggie',
    'Freyo Tower',
  ]);

  for (let i = 0; i < menuItems.length; i++) {
    const itemData = menuItems[i];
    const catId = categoryMap[itemData.category];

    // Upsert menu item
    const item = await prisma.menuItem.upsert({
      where: { name: itemData.name },
      update: {
        categoryId: catId,
        basePrice: itemData.basePrice,
        description: itemData.description,
        isVeg: itemData.isVeg,
        prepTime: itemData.prepTime,
        popular: itemData.popular ?? false,
        recommended: itemData.recommended ?? false,
        bestSeller: itemData.bestSeller ?? false,
        displayOrder: i + 1,
      },
      create: {
        name: itemData.name,
        categoryId: catId,
        basePrice: itemData.basePrice,
        description: itemData.description,
        isVeg: itemData.isVeg,
        prepTime: itemData.prepTime,
        popular: itemData.popular ?? false,
        recommended: itemData.recommended ?? false,
        bestSeller: itemData.bestSeller ?? false,
        displayOrder: i + 1,
        image: null,
      },
    });

    // Upsert variants
    if (itemData.variants && itemData.variants.length > 0) {
      for (const v of itemData.variants) {
        await prisma.menuVariant.upsert({
          where: {
            menuItemId_name: {
              menuItemId: item.id,
              name: v.name,
            },
          },
          update: {
            price: v.price,
            isActive: true,
          },
          create: {
            menuItemId: item.id,
            name: v.name,
            price: v.price,
            isActive: true,
          },
        });
      }
    }

    // Generate empty Recipe record for food items
    if (foodCategories.has(itemData.category)) {
      await prisma.recipe.upsert({
        where: {
          menuItemId_ingredientId: {
            menuItemId: item.id,
            ingredientId: dummyIngredient.id,
          },
        },
        update: {
          quantity: 0.0,
        },
        create: {
          menuItemId: item.id,
          ingredientId: dummyIngredient.id,
          quantity: 0.0,
        },
      });
    }
  }

  console.log('Database seeding completed successfully!');
}

if (require.main === module) {
  const prisma = new PrismaClient();

  seedDatabaseIfEmpty(prisma)
    .then(() => {
      console.log('Seed process finished successfully.');
    })
    .catch((error) => {
      console.error('Seed process failed:', error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
