import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { normalizePhone } from '../common/phone.util';
import { CreatePublicOrderDto } from './dto/create-public-order.dto';
import { CreatePosOrderDto, PosOrderType } from './dto/create-pos-order.dto';
import { FinancialCalculationService } from './financial-calculation.service';
import { CartPricingService } from './cart-pricing.service';
import {
  OrderStatus,
  PaymentStatus,
  OrderSource,
  Role,
  Prisma,
  BillStatus,
  PaymentStatusDetail,
  StockTxType,
} from '@prisma/client';
import * as crypto from 'crypto';

export class LoyaltyReversalNegativeBalanceError extends Error {
  constructor(
    public readonly metadata: {
      customerId: string;
      orderId: string;
      billId: string;
      currentPoints: number;
      pointsToDeduct: number;
      staffId: string;
    },
  ) {
    super(
      'Loyalty reversal blocked: customer has already consumed the earned points and reversal would make their balance negative.',
    );
    Object.setPrototypeOf(this, LoyaltyReversalNegativeBalanceError.prototype);
  }
}

@Injectable()
export class OrdersService {
  constructor(
    private prisma: PrismaService,
    private calcService: FinancialCalculationService,
    private cartPricingService: CartPricingService,
  ) {}

  // ==========================================
  // CUSTOMER ORDER CREATION (WITH IDEMPOTENCY)
  // ==========================================

  async createPublicOrder(
    dto: CreatePublicOrderDto,
  ): Promise<Record<string, unknown>> {
    // 1. Check idempotency key first to prevent duplicate creation
    const existingOrder = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: {
        items: {
          include: { addons: true },
        },
      },
    });

    if (existingOrder) {
      return this.sanitizeOrderResponse(existingOrder);
    }

    try {
      const created = await this.executeOrderTransaction(dto);
      return this.sanitizeOrderResponse(created);
    } catch (error: unknown) {
      // 2. Handle concurrent duplicate submission race conditions
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const targetFields =
          error.meta && Array.isArray(error.meta.target)
            ? (error.meta.target as unknown as string[])
            : [];
        if (targetFields.includes('idempotencyKey')) {
          // Fetch the successfully created order from the concurrent thread
          const order = await this.prisma.order.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: {
              items: {
                include: { addons: true },
              },
            },
          });
          if (order) {
            return this.sanitizeOrderResponse(order);
          }
        }
      }
      throw error;
    }
  }

  private async executeOrderTransaction(
    dto: CreatePublicOrderDto,
  ): Promise<Record<string, unknown>> {
    // 1. Validate Table ID and Token match
    const table = await this.prisma.restaurantTable.findUnique({
      where: { id: dto.tableId },
      include: { qrToken: true },
    });

    if (!table || !table.isActive) {
      throw new BadRequestException(
        'The selected table is inactive or does not exist.',
      );
    }

    if (!table.qrToken || table.qrToken.token !== dto.token) {
      throw new BadRequestException('Invalid or expired table QR token.');
    }

    // 2. Fetch Restaurant Settings
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      throw new BadRequestException(
        'Restaurant configuration settings not found.',
      );
    }

    if (!settings.qrOrderingEnabled) {
      throw new BadRequestException(
        'QR ordering is currently disabled by the restaurant.',
      );
    }

    // 3. Customer Info Validation
    if (settings.requireCustomerName && !dto.customerName.trim()) {
      throw new BadRequestException('Customer Name is required.');
    }
    if (settings.requireCustomerPhone && !dto.customerPhone.trim()) {
      throw new BadRequestException('Customer Phone Number is required.');
    }

    // Phone Normalization (Indian phone format check)
    const finalPhone = normalizePhone(dto.customerPhone);

    // 4. Validate Cart Items & fetch database prices using shared service
    const { subtotal: calculatedSubtotal, validatedItems: rawValidatedItems } =
      await this.cartPricingService.resolveAndValidateCart(dto.items);

    const validatedItemsList = rawValidatedItems.map((item) => ({
      ...item,
      discountSnapshot: 0.0,
      notes: dto.items.find((i) => i.menuItemId === item.menuItemId)?.notes,
    }));

    // 5. Calculations
    const calcResult = this.calcService.calculate({
      subtotal: calculatedSubtotal,
      manualDiscount: 0,
      couponDiscount: 0,
      settings,
    });

    // 6. DB Transactional Creation
    return this.prisma.$transaction(async (tx) => {
      // Find or create Customer
      const customer = await tx.customer.upsert({
        where: { phone: finalPhone },
        update: {
          name: dto.customerName.trim(),
          marketingConsent: dto.marketingConsent ?? false,
          visitCount: { increment: 1 },
        },
        create: {
          name: dto.customerName.trim(),
          phone: finalPhone,
          marketingConsent: dto.marketingConsent ?? false,
          visitCount: 1,
        },
      });

      // Generate secure unique public tracking token
      const publicTrackingToken =
        'TRK_' + crypto.randomBytes(16).toString('hex').toUpperCase();

      // Generate safe unique Order Number with retry loop inside transaction
      let orderNumber = '';
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        attempts++;
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
        const randomDigits = Math.floor(1000 + Math.random() * 9000); // 4 random digits
        const candidateNum = `CCB-${dateStr}-${randomDigits}`;

        // Verify uniqueness
        const duplicate = await tx.order.findUnique({
          where: { orderNumber: candidateNum },
        });

        if (!duplicate) {
          orderNumber = candidateNum;
          break;
        }
      }

      if (!orderNumber) {
        throw new ConflictException(
          'Failed to generate a unique order number. Please try again.',
        );
      }

      // Create Order
      const order = await tx.order.create({
        data: {
          orderNumber,
          publicTrackingToken,
          idempotencyKey: dto.idempotencyKey,
          customerId: customer.id,
          tableId: table.id,
          tableNumberSnapshot: table.tableNumber,
          source: OrderSource.QR,
          status: OrderStatus.RECEIVED,
          paymentStatus: PaymentStatus.UNPAID,
          subtotal: calcResult.subtotal,
          discount: calcResult.discount,
          couponDiscount: calcResult.couponDiscount,
          taxableAmount: calcResult.taxableAmount,
          cgst: calcResult.cgst,
          sgst: calcResult.sgst,
          serviceCharge: calcResult.serviceCharge,
          nightCharge: calcResult.nightCharge,
          roundOff: calcResult.roundOff,
          grandTotal: calcResult.grandTotal,
          notes:
            dto.items
              .map((i) => i.notes)
              .filter(Boolean)
              .join(' | ') || null,
        },
      });

      // Create Order Items and Snapshots
      for (const item of validatedItemsList) {
        const orderItem = await tx.orderItem.create({
          data: {
            orderId: order.id,
            menuItemId: item.menuItemId,
            nameSnapshot: item.nameSnapshot,
            variantId: item.variantId,
            variantNameSnapshot: item.variantNameSnapshot,
            priceSnapshot: item.priceSnapshot,
            variantPriceSnapshot: item.variantPriceSnapshot,
            discountSnapshot: item.discountSnapshot,
            quantity: item.quantity,
            notes: item.notes,
            totalPrice: item.totalPrice,
          },
        });

        if (item.addons.length > 0) {
          await tx.orderItemAddon.createMany({
            data: item.addons.map((a) => ({
              orderItemId: orderItem.id,
              addonId: a.addonId,
              nameSnapshot: a.nameSnapshot,
              priceSnapshot: a.priceSnapshot,
            })),
          });
        }
      }

      // Create initial OrderStatusHistory record
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          newStatus: OrderStatus.RECEIVED,
          notes: 'Customer submitted order via table QR.',
        },
      });

      // Prepare or update Invoice/Bill record (unfinalized draft bill) and table sessions
      const bill = await this.handleTableSessionAndBill(
        tx,
        table.id,
        order.id,
        calcResult,
        settings,
      );

      // Authoritative Coupon validation and application inside transaction
      if (dto.couponCode) {
        const couponRes = await this.processCouponApplication(
          tx,
          dto.couponCode,
          customer.id,
          calculatedSubtotal,
          bill.id,
          order.id,
        );

        const calcResultWithCoupon = this.calcService.calculate({
          subtotal: calculatedSubtotal,
          manualDiscount: 0,
          couponDiscount: couponRes.couponDiscount,
          settings,
        });

        // Update the Bill with calculated values and coupon metadata
        await tx.bill.update({
          where: { id: bill.id },
          data: {
            appliedCouponId: couponRes.couponId,
            appliedCouponCode: dto.couponCode.trim().toUpperCase(),
            couponDiscount: couponRes.couponDiscount,
            discount: calcResultWithCoupon.discount,
            totalDiscount: calcResultWithCoupon.discount,
            taxableAmount: calcResultWithCoupon.taxableAmount,
            cgst: calcResultWithCoupon.cgst,
            sgst: calcResultWithCoupon.sgst,
            serviceCharge: calcResultWithCoupon.serviceCharge,
            nightCharge: calcResultWithCoupon.nightCharge,
            preRoundGrandTotal: calcResultWithCoupon.preRoundGrandTotal,
            roundOff: calcResultWithCoupon.roundOff,
            grandTotal: calcResultWithCoupon.grandTotal,
          },
        });

        // Update Order totals to match the updated calculations
        await tx.order.update({
          where: { id: order.id },
          data: {
            couponDiscount: couponRes.couponDiscount,
            discount: calcResultWithCoupon.discount,
            taxableAmount: calcResultWithCoupon.taxableAmount,
            cgst: calcResultWithCoupon.cgst,
            sgst: calcResultWithCoupon.sgst,
            serviceCharge: calcResultWithCoupon.serviceCharge,
            nightCharge: calcResultWithCoupon.nightCharge,
            roundOff: calcResultWithCoupon.roundOff,
            grandTotal: calcResultWithCoupon.grandTotal,
          },
        });
      }

      // Clear the customer's cart for this table on successful order placement
      const cart = await tx.customerCart.findUnique({
        where: { tableId: table.id },
      });
      if (cart) {
        await tx.customerCartItem.deleteMany({
          where: { cartId: cart.id },
        });
      }

      const orderRecord = await tx.order.findUnique({
        where: { id: order.id },
        include: {
          items: {
            include: { addons: true },
          },
        },
      });
      if (!orderRecord) {
        throw new BadRequestException('Order creation failed.');
      }
      return orderRecord;
    });
  }

  // ==========================================
  // CUSTOMER TRACKING ENDPOINT
  // ==========================================

  async getOrderTrackingDetails(
    trackingToken: string,
  ): Promise<Record<string, unknown>> {
    const order = await this.prisma.order.findUnique({
      where: { publicTrackingToken: trackingToken },
      include: {
        table: true,
        items: {
          include: { addons: true },
        },
        bills: {
          where: { status: { in: [BillStatus.FINALIZED, BillStatus.PAID] } },
        },
        payments: {
          where: { status: PaymentStatusDetail.COMPLETED },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found or tracking link invalid.');
    }

    if (order.tableSessionId) {
      const sessionOrders = await this.prisma.order.findMany({
        where: {
          tableSessionId: order.tableSessionId,
          status: { notIn: ['CANCELLED', 'VOIDED'] },
        },
        include: {
          items: {
            include: { addons: true },
          },
          payments: {
            where: { status: PaymentStatusDetail.COMPLETED },
          },
        },
      });

      const mergedItems = [];
      const mergedPayments = [];
      for (const so of sessionOrders) {
        mergedItems.push(...so.items);
        mergedPayments.push(...so.payments);
      }
      (order as any).items = mergedItems;
      (order as any).payments = mergedPayments;

      const activeBill = await this.prisma.bill.findFirst({
        where: { tableSessionId: order.tableSessionId, status: BillStatus.DRAFT },
      }) || await this.prisma.bill.findFirst({
        where: { tableSessionId: order.tableSessionId },
        orderBy: { createdAt: 'desc' },
      });

      if (activeBill) {
        order.subtotal = activeBill.subtotal;
        order.discount = activeBill.discount;
        order.couponDiscount = activeBill.couponDiscount;
        order.taxableAmount = activeBill.taxableAmount;
        order.cgst = activeBill.cgst;
        order.sgst = activeBill.sgst;
        order.serviceCharge = activeBill.serviceCharge;
        order.nightCharge = activeBill.nightCharge;
        order.roundOff = activeBill.roundOff;
        order.grandTotal = activeBill.grandTotal;
        (order as any).bills = [activeBill];
      }
    }

    const settledSum = order.payments
      .filter((p) => p.isSettled)
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const grandTotal = Number(order.grandTotal);
    const outstandingAmount = Math.max(
      0,
      this.calcService.roundToTwo(grandTotal - settledSum),
    );

    const finalizedBill = order.bills[0] || null;
    const invoiceNumber = finalizedBill ? finalizedBill.invoiceNumber : null;

    const sanitized = this.sanitizeOrderResponse(order);
    sanitized.outstandingAmount = outstandingAmount;
    sanitized.invoiceNumber = invoiceNumber;

    delete sanitized.bills;
    delete sanitized.payments;

    return sanitized;
  }

  // ==========================================
  // UTILITIES
  // ==========================================

  private roundToTwo(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  private isNightTime(
    nightStart: string,
    nightEnd: string,
    timezone: string,
  ): boolean {
    try {
      const now = new Date();
      // Get current date time in the target timezone
      const localStr = now.toLocaleString('en-US', { timeZone: timezone });
      const localDate = new Date(localStr);

      const hours = localDate.getHours();
      const minutes = localDate.getMinutes();
      const currentVal = hours * 60 + minutes;

      const [startH, startM] = nightStart.split(':').map(Number);
      const startVal = startH * 60 + startM;

      const [endH, endM] = nightEnd.split(':').map(Number);
      const endVal = endH * 60 + endM;

      if (startVal > endVal) {
        // Crosses midnight (e.g. 22:00 to 02:00)
        return currentVal >= startVal || currentVal <= endVal;
      } else {
        // Same day (e.g. 01:00 to 05:00)
        return currentVal >= startVal && currentVal <= endVal;
      }
    } catch {
      return false;
    }
  }

  private sanitizeOrderResponse(
    order: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!order) return {};
    const sanitized = JSON.parse(JSON.stringify(order)) as Record<
      string,
      unknown
    >;
    if (sanitized.customer && typeof sanitized.customer === 'object') {
      const customer = sanitized.customer as Record<string, unknown>;
      sanitized.customer = {
        name: customer.name,
      };
    }
    delete sanitized.idempotencyKey;
    return sanitized;
  }

  // ==========================================
  // STAFF ORDER MANAGEMENT (PHASE 4)
  // ==========================================

  async getLiveOrders() {
    const liveStatuses: OrderStatus[] = [
      OrderStatus.RECEIVED,
      OrderStatus.ACCEPTED,
      OrderStatus.PREPARING,
      OrderStatus.READY,
      OrderStatus.SERVED,
    ];

    // Waiters can see all active orders, but can only transition READY -> SERVED
    return this.prisma.order.findMany({
      where: {
        status: { in: liveStatuses },
      },
      include: {
        table: true,
        customer: true,
        items: {
          include: { addons: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOrders(filters: {
    page?: number;
    limit?: number;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    source?: OrderSource;
    tableId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.OrderWhereInput = {
      AND: [
        {
          OR: [
            { tableSessionId: null },
            { bills: { some: {} } }
          ]
        }
      ]
    };

    if (filters.status) (where as any).status = filters.status;
    if (filters.paymentStatus) (where as any).paymentStatus = filters.paymentStatus;
    if (filters.source) (where as any).source = filters.source;
    if (filters.tableId) (where as any).tableId = filters.tableId;

    if (filters.search) {
      where.OR = [
        { orderNumber: { contains: filters.search } },
        { customer: { name: { contains: filters.search } } },
        { customer: { phone: { contains: filters.search } } },
      ];
    }

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) {
        where.createdAt.gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        where.createdAt.lte = new Date(filters.endDate);
      }
    }

    const [total, data] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          table: true,
          customer: true,
          items: {
            include: { addons: true },
          },
          bills: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOrderById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        table: true,
        customer: true,
        createdBy: {
          select: { id: true, name: true, role: true },
        },
        items: {
          include: { addons: true },
        },
        statusHistory: {
          include: {
            changedBy: {
              select: { id: true, name: true, role: true },
            },
          },
          orderBy: { changedAt: 'asc' },
        },
        bills: true,
        payments: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  async updateOrderStatus(
    id: string,
    newStatus: OrderStatus,
    changedById: string,
    role: Role,
    override = false,
    overrideReason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // Fetch order and validate current status
      const order = await tx.order.findUnique({ where: { id } });
      if (!order) throw new NotFoundException('Order not found');

      // State machine validation
      const oldStatus = order.status;

      if (oldStatus === newStatus) {
        return order;
      }

      if (override) {
        if (role !== Role.OWNER) {
          throw new BadRequestException(
            'Only the OWNER can override status rules.',
          );
        }
        if (!overrideReason?.trim()) {
          throw new BadRequestException('An override reason is required.');
        }
      } else {
        // Enforce normal transitions
        let isValid = false;
        if (
          oldStatus === OrderStatus.RECEIVED &&
          newStatus === OrderStatus.ACCEPTED
        )
          isValid = true;
        else if (
          oldStatus === OrderStatus.ACCEPTED &&
          newStatus === OrderStatus.PREPARING
        )
          isValid = true;
        else if (
          oldStatus === OrderStatus.PREPARING &&
          newStatus === OrderStatus.READY
        )
          isValid = true;
        else if (
          oldStatus === OrderStatus.READY &&
          newStatus === OrderStatus.SERVED
        )
          isValid = true;
        else if (
          oldStatus === OrderStatus.SERVED &&
          newStatus === OrderStatus.COMPLETED
        )
          isValid = true;

        if (!isValid) {
          throw new BadRequestException(
            `Invalid status transition from ${oldStatus} to ${newStatus}. Requires owner override.`,
          );
        }

        // Waiter role restrictions: can only perform READY -> SERVED
        if (
          role === Role.WAITER &&
          !(oldStatus === OrderStatus.READY && newStatus === OrderStatus.SERVED)
        ) {
          throw new BadRequestException(
            'Waiter role is only permitted to mark orders as SERVED.',
          );
        }

        // Cashier role restrictions: can only mark SERVED -> COMPLETED
        if (
          role === Role.CASHIER &&
          !(
            oldStatus === OrderStatus.SERVED &&
            newStatus === OrderStatus.COMPLETED
          )
        ) {
          throw new BadRequestException(
            'Cashier role is only permitted to mark orders as COMPLETED.',
          );
        }
      }

      if (newStatus === OrderStatus.COMPLETED) {
        if (order.paymentStatus !== PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.CREDIT) {
          if (!override || role !== Role.OWNER) {
            throw new BadRequestException(
              'Cannot complete an order that is not fully paid. Requires owner override with a reason.',
            );
          }
        }
      }

      // Optimistic concurrency safety check
      const updatedOrder = await tx.order.updateMany({
        where: { id, status: oldStatus },
        data: { status: newStatus },
      });

      if (updatedOrder.count === 0) {
        throw new ConflictException(
          'Order status has already changed. Refreshing order.',
        );
      }

      // Create OrderStatusHistory
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus,
          newStatus,
          changedById,
          notes: override
            ? `Owner override reason: ${overrideReason}`
            : undefined,
        },
      });

      await this.handleStockTransition(tx, id, newStatus, changedById);

      // Update Table occupied status
      if (
        newStatus === OrderStatus.RECEIVED ||
        newStatus === OrderStatus.ACCEPTED ||
        newStatus === OrderStatus.PREPARING ||
        newStatus === OrderStatus.READY ||
        newStatus === OrderStatus.SERVED
      ) {
        if (order.tableId) {
          await tx.restaurantTable.update({
            where: { id: order.tableId },
            data: { status: 'OCCUPIED' },
          });
        }
      } else if (
        newStatus === OrderStatus.COMPLETED ||
        newStatus === OrderStatus.CANCELLED ||
        newStatus === OrderStatus.VOIDED
      ) {
        await this.updateTableStatusIfNeeded(order.tableId, tx);
      }

      // Write AuditLog
      await tx.auditLog.create({
        data: {
          staffId: changedById,
          action: override ? 'OWNER_STATUS_OVERRIDE' : 'ORDER_STATUS_CHANGE',
          entityType: 'Order',
          entityId: id,
          oldData: JSON.stringify({ status: oldStatus }),
          newData: JSON.stringify({ status: newStatus, overrideReason }),
        },
      });

      return tx.order.findUnique({
        where: { id },
        include: { table: true, customer: true },
      });
    });
  }

  async cancelOrder(
    id: string,
    reason: string,
    customReason: string | undefined,
    cancelledById: string,
    role: Role,
  ) {
    if (role === Role.WAITER) {
      throw new BadRequestException('Waiter role cannot cancel orders.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id } });
        if (!order) throw new NotFoundException('Order not found');

        if (
          order.status === OrderStatus.CANCELLED ||
          order.status === OrderStatus.VOIDED
        ) {
          throw new BadRequestException(
            'Order is already in a cancelled/voided terminal state.',
          );
        }

        const oldStatus = order.status;

        // Update order status to CANCELLED
        await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.CANCELLED,
            cancellationReason: customReason
              ? `${reason}: ${customReason}`
              : reason,
            cancelledById,
            cancelledAt: new Date(),
          },
        });

        // Create status history record
        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            oldStatus,
            newStatus: OrderStatus.CANCELLED,
            changedById: cancelledById,
            notes: customReason ? `${reason}: ${customReason}` : reason,
          },
        });

        await this.handleStockTransition(
          tx,
          id,
          OrderStatus.CANCELLED,
          cancelledById,
        );

        // Reverse loyalty effects if finalized bill exists
        await this.reverseLoyaltyEffects(tx, id, cancelledById);

        // Reverse coupon effects if coupon usage exists
        await this.reverseCouponEffects(tx, id);

        // Free up table if needed
        await this.updateTableStatusIfNeeded(order.tableId, tx);

        // Audit Log
        await tx.auditLog.create({
          data: {
            staffId: cancelledById,
            action: 'ORDER_CANCEL',
            entityType: 'Order',
            entityId: id,
            newData: JSON.stringify({
              cancellationReason: reason,
              customReason,
            }),
          },
        });

        return tx.order.findUnique({ where: { id } });
      });
    } catch (err) {
      if (err instanceof LoyaltyReversalNegativeBalanceError) {
        try {
          await this.prisma.auditLog.create({
            data: {
              staffId: err.metadata.staffId,
              action: 'LOYALTY_REVERSAL_BLOCKED_NEGATIVE_BALANCE',
              entityType: 'Customer',
              entityId: err.metadata.customerId,
              newData: JSON.stringify({
                billId: err.metadata.billId,
                currentPoints: err.metadata.currentPoints,
                pointsToDeduct: err.metadata.pointsToDeduct,
              }),
            },
          });
        } catch (auditErr) {
          console.error(
            'Failed to log loyalty reversal block audit:',
            auditErr,
          );
        }
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  async voidOrder(id: string, reason: string, voidedById: string, role: Role) {
    if (role !== Role.OWNER) {
      throw new BadRequestException('Only the OWNER can void orders.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id } });
        if (!order) throw new NotFoundException('Order not found');

        const oldStatus = order.status;

        await tx.order.update({
          where: { id },
          data: {
            status: OrderStatus.VOIDED,
            cancellationReason: `VOID: ${reason}`,
            cancelledById: voidedById,
            cancelledAt: new Date(),
          },
        });

        await tx.orderStatusHistory.create({
          data: {
            orderId: id,
            oldStatus,
            newStatus: OrderStatus.VOIDED,
            changedById: voidedById,
            notes: `Voided: ${reason}`,
          },
        });

        await this.handleStockTransition(
          tx,
          id,
          OrderStatus.VOIDED,
          voidedById,
        );

        // Reverse loyalty effects if finalized bill exists
        await this.reverseLoyaltyEffects(tx, id, voidedById);

        // Reverse coupon effects if coupon usage exists
        await this.reverseCouponEffects(tx, id);

        await this.updateTableStatusIfNeeded(order.tableId, tx);

        await tx.auditLog.create({
          data: {
            staffId: voidedById,
            action: 'ORDER_VOID',
            entityType: 'Order',
            entityId: id,
            newData: JSON.stringify({ voidReason: reason }),
          },
        });

        return tx.order.findUnique({ where: { id } });
      });
    } catch (err) {
      if (err instanceof LoyaltyReversalNegativeBalanceError) {
        try {
          await this.prisma.auditLog.create({
            data: {
              staffId: err.metadata.staffId,
              action: 'LOYALTY_REVERSAL_BLOCKED_NEGATIVE_BALANCE',
              entityType: 'Customer',
              entityId: err.metadata.customerId,
              newData: JSON.stringify({
                billId: err.metadata.billId,
                currentPoints: err.metadata.currentPoints,
                pointsToDeduct: err.metadata.pointsToDeduct,
              }),
            },
          });
        } catch (auditErr) {
          console.error(
            'Failed to log loyalty reversal block audit:',
            auditErr,
          );
        }
        throw new BadRequestException(err.message);
      }
      throw err;
    }
  }

  private async reverseLoyaltyEffects(
    tx: Prisma.TransactionClient,
    orderId: string,
    staffId: string,
  ) {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order || !order.customerId) return;

    const bill = await tx.bill.findFirst({
      where: { orderId, status: 'FINALIZED' },
    });
    if (!bill) return;

    const customer = await tx.customer.findUnique({
      where: { id: order.customerId },
    });
    if (!customer) return;

    let currentPoints = customer.loyaltyPoints;

    // 1. EARN Reversal
    const earnTx = await tx.loyaltyTransaction.findUnique({
      where: { idempotencyKey: `LOYALTY_EARN:${bill.id}` },
    });
    if (earnTx) {
      const earnReversalIdempotencyKey = `LOYALTY_EARN_REVERSAL:${bill.id}`;
      const existingEarnReversal = await tx.loyaltyTransaction.findUnique({
        where: { idempotencyKey: earnReversalIdempotencyKey },
      });

      if (!existingEarnReversal) {
        const pointsToDeduct = earnTx.pointsChange; // positive integer
        if (currentPoints - pointsToDeduct < 0) {
          throw new LoyaltyReversalNegativeBalanceError({
            customerId: order.customerId,
            orderId,
            billId: bill.id,
            currentPoints,
            pointsToDeduct,
            staffId,
          });
        }

        currentPoints -= pointsToDeduct;
        await tx.customer.update({
          where: { id: order.customerId },
          data: { loyaltyPoints: currentPoints },
        });

        await tx.loyaltyTransaction.create({
          data: {
            customerId: order.customerId,
            type: 'EARN_REVERSAL',
            pointsChange: -pointsToDeduct,
            balanceAfter: currentPoints,
            billId: bill.id,
            orderId,
            reason: 'Order cancelled or voided',
            idempotencyKey: earnReversalIdempotencyKey,
            createdByStaffId: staffId,
          },
        });
      }
    }

    // 2. REDEEM Reversal
    const redeemTx = await tx.loyaltyTransaction.findUnique({
      where: { idempotencyKey: `LOYALTY_REDEEM:${bill.id}` },
    });
    if (redeemTx) {
      const redeemReversalIdempotencyKey = `LOYALTY_REDEEM_REVERSAL:${bill.id}`;
      const existingRedeemReversal = await tx.loyaltyTransaction.findUnique({
        where: { idempotencyKey: redeemReversalIdempotencyKey },
      });

      if (!existingRedeemReversal) {
        const pointsToRestore = Math.abs(redeemTx.pointsChange); // negative integer originally, so take absolute
        currentPoints += pointsToRestore;

        await tx.customer.update({
          where: { id: order.customerId },
          data: { loyaltyPoints: currentPoints },
        });

        await tx.loyaltyTransaction.create({
          data: {
            customerId: order.customerId,
            type: 'REDEMPTION_REVERSAL',
            pointsChange: pointsToRestore,
            balanceAfter: currentPoints,
            billId: bill.id,
            orderId,
            reason: 'Order cancelled or voided',
            idempotencyKey: redeemReversalIdempotencyKey,
            createdByStaffId: staffId,
          },
        });
      }
    }
  }

  private async updateTableStatusIfNeeded(
    tableId: string | null,
    tx: Prisma.TransactionClient,
  ) {
    if (!tableId) return;

    const activeOrders = await tx.order.findMany({
      where: {
        tableId,
        status: {
          in: [
            OrderStatus.RECEIVED,
            OrderStatus.ACCEPTED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
            OrderStatus.SERVED,
          ],
        },
      },
    });

    const table = await tx.restaurantTable.findUnique({
      where: { id: tableId },
    });
    if (activeOrders.length === 0) {
      if (table && table.status !== 'CLEANING') {
        await tx.restaurantTable.update({
          where: { id: tableId },
          data: { status: 'AVAILABLE' },
        });
      }
    } else {
      await tx.restaurantTable.update({
        where: { id: tableId },
        data: { status: 'OCCUPIED' },
      });
    }
  }

  async createPosOrder(
    staffId: string,
    role: Role,
    dto: CreatePosOrderDto,
  ): Promise<Record<string, unknown>> {
    if (role === Role.WAITER) {
      throw new BadRequestException(
        'Waiters are not authorized to create POS orders.',
      );
    }

    if (dto.orderType === PosOrderType.DINE_IN && !dto.tableId) {
      throw new BadRequestException(
        'A valid table is required for Dine-in orders.',
      );
    }

    // 1. Check idempotency key first to prevent duplicate creation
    if (dto.idempotencyKey) {
      const existingOrder = await this.prisma.order.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: {
          items: {
            include: { addons: true },
          },
        },
      });

      if (existingOrder) {
        return this.sanitizeOrderResponse(existingOrder);
      }
    }

    // 2. Fetch Restaurant settings
    const settings = await this.prisma.restaurantSettings.findUnique({
      where: { id: 'default' },
    });

    if (!settings) {
      throw new NotFoundException('Restaurant settings not found');
    }

    // 3. Resolve table for DINE_IN (or ensure null for TAKEAWAY)
    let table: any = null;
    if (dto.orderType === PosOrderType.DINE_IN && dto.tableId) {
      table = await this.prisma.restaurantTable.findUnique({
        where: { id: dto.tableId },
      });
      if (!table || !table.isActive) {
        throw new BadRequestException('Selected table is inactive or invalid.');
      }
    }

    // 4. Normalize phone number using standard rules
    const finalPhone = dto.customerPhone?.trim()
      ? normalizePhone(dto.customerPhone)
      : '+910000000000';

    const customerNameVal = dto.customerName?.trim() || 'Walk-in Customer';

    // 5. Fetch and validate items using shared service
    const { subtotal: calculatedSubtotal, validatedItems: rawValidatedItems } =
      await this.cartPricingService.resolveAndValidateCart(dto.items);

    const validatedItemsList = rawValidatedItems.map((item) => ({
      ...item,
      discountSnapshot: 0.0,
      notes: dto.items.find((i) => i.menuItemId === item.menuItemId)?.notes,
    }));

    // 6. Manual discount estimation (if supplied in POS DTO)
    let manualDiscountAmount = 0;
    if (dto.manualDiscountType && dto.manualDiscountValue) {
      if (dto.manualDiscountType === 'FLAT') {
        manualDiscountAmount = dto.manualDiscountValue;
      } else {
        manualDiscountAmount = this.calcService.roundToTwo(
          (calculatedSubtotal * dto.manualDiscountValue) / 100,
        );
      }
    }

    const calcResult = this.calcService.calculate({
      subtotal: calculatedSubtotal,
      manualDiscount: manualDiscountAmount,
      couponDiscount: 0,
      settings,
    });

    // 8. DB Transactional Creation
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        // Upsert Customer
        const customer = await tx.customer.upsert({
          where: { phone: finalPhone },
          update: {
            name: customerNameVal,
            marketingConsent: dto.marketingConsent ?? false,
            visitCount: { increment: 1 },
          },
          create: {
            name: customerNameVal,
            phone: finalPhone,
            marketingConsent: dto.marketingConsent ?? false,
            visitCount: 1,
          },
        });

        const publicTrackingToken =
          'TRK_' + crypto.randomBytes(16).toString('hex').toUpperCase();

        // Generate safe unique Order Number
        let orderNumber = '';
        let attempts = 0;
        const maxAttempts = 5;

        while (attempts < maxAttempts) {
          attempts++;
          const dateStr = new Date()
            .toISOString()
            .slice(0, 10)
            .replace(/-/g, '');
          const randomDigits = Math.floor(1000 + Math.random() * 9000);
          const candidateNum = `CCB-${dateStr}-${randomDigits}`;

          const duplicate = await tx.order.findUnique({
            where: { orderNumber: candidateNum },
          });

          if (!duplicate) {
            orderNumber = candidateNum;
            break;
          }
        }

        if (!orderNumber) {
          throw new ConflictException(
            'Failed to generate a unique order number.',
          );
        }

        // Map POS staff role to order source
        let orderSource: OrderSource = OrderSource.CASHIER;
        if (role === Role.OWNER) orderSource = OrderSource.OWNER_POS;
        else if (role === Role.MANAGER) orderSource = OrderSource.MANAGER;

        // Create Order starting as ACCEPTED
        const order = await tx.order.create({
          data: {
            orderNumber,
            publicTrackingToken,
            idempotencyKey: dto.idempotencyKey,
            customerId: customer.id,
            tableId: table ? table.id : null,
            tableNumberSnapshot: table ? table.tableNumber : null,
            source: orderSource,
            status: OrderStatus.ACCEPTED,
            paymentStatus: PaymentStatus.UNPAID,
            subtotal: calcResult.subtotal,
            discount: calcResult.discount,
            couponDiscount: calcResult.couponDiscount,
            taxableAmount: calcResult.taxableAmount,
            cgst: calcResult.cgst,
            sgst: calcResult.sgst,
            serviceCharge: calcResult.serviceCharge,
            nightCharge: calcResult.nightCharge,
            roundOff: calcResult.roundOff,
            grandTotal: calcResult.grandTotal,
            createdById: staffId,
            notes:
              dto.items
                .map((i) => i.notes)
                .filter(Boolean)
                .join(' | ') || null,
          },
        });

        // Create Items & Addons
        for (const item of validatedItemsList) {
          const orderItem = await tx.orderItem.create({
            data: {
              orderId: order.id,
              menuItemId: item.menuItemId,
              nameSnapshot: item.nameSnapshot,
              variantId: item.variantId,
              variantNameSnapshot: item.variantNameSnapshot,
              priceSnapshot: item.priceSnapshot,
              variantPriceSnapshot: item.variantPriceSnapshot,
              discountSnapshot: item.discountSnapshot,
              quantity: item.quantity,
              notes: item.notes,
              totalPrice: item.totalPrice,
            },
          });

          if (item.addons.length > 0) {
            await tx.orderItemAddon.createMany({
              data: item.addons.map((a) => ({
                orderItemId: orderItem.id,
                addonId: a.addonId,
                nameSnapshot: a.nameSnapshot,
                priceSnapshot: a.priceSnapshot,
              })),
            });
          }
        }

        // Status history created by staff
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            newStatus: OrderStatus.ACCEPTED,
            changedById: staffId,
            notes: `Order created directly on POS by staff.`,
          },
        });

        // Prepare or update draft Bill and table sessions
        const bill = await this.handleTableSessionAndBill(
          tx,
          table ? table.id : null,
          order.id,
          calcResult,
          settings,
        );

        if (dto.manualDiscountValue) {
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              manualDiscountType: dto.manualDiscountType,
              manualDiscountValue: dto.manualDiscountValue,
              manualDiscountReason: dto.manualDiscountReason,
              manualDiscountAppliedBy: staffId,
            },
          });
        }

        // Authoritative Coupon validation and application inside transaction
        if (dto.couponCode) {
          const couponRes = await this.processCouponApplication(
            tx,
            dto.couponCode,
            customer.id,
            calculatedSubtotal,
            bill.id,
            order.id,
          );

          const calcResultWithCoupon = this.calcService.calculate({
            subtotal: calculatedSubtotal,
            manualDiscount: manualDiscountAmount,
            couponDiscount: couponRes.couponDiscount,
            settings,
          });

          // Update the Bill with calculated values and coupon metadata
          await tx.bill.update({
            where: { id: bill.id },
            data: {
              appliedCouponId: couponRes.couponId,
              appliedCouponCode: dto.couponCode.trim().toUpperCase(),
              couponDiscount: couponRes.couponDiscount,
              discount: calcResultWithCoupon.discount,
              totalDiscount: calcResultWithCoupon.discount,
              taxableAmount: calcResultWithCoupon.taxableAmount,
              cgst: calcResultWithCoupon.cgst,
              sgst: calcResultWithCoupon.sgst,
              serviceCharge: calcResultWithCoupon.serviceCharge,
              nightCharge: calcResultWithCoupon.nightCharge,
              preRoundGrandTotal: calcResultWithCoupon.preRoundGrandTotal,
              roundOff: calcResultWithCoupon.roundOff,
              grandTotal: calcResultWithCoupon.grandTotal,
            },
          });

          // Update Order totals to match the updated calculations
          await tx.order.update({
            where: { id: order.id },
            data: {
              couponDiscount: couponRes.couponDiscount,
              discount: calcResultWithCoupon.discount,
              taxableAmount: calcResultWithCoupon.taxableAmount,
              cgst: calcResultWithCoupon.cgst,
              sgst: calcResultWithCoupon.sgst,
              serviceCharge: calcResultWithCoupon.serviceCharge,
              nightCharge: calcResultWithCoupon.nightCharge,
              roundOff: calcResultWithCoupon.roundOff,
              grandTotal: calcResultWithCoupon.grandTotal,
            },
          });
        }

        return tx.order.findUnique({
          where: { id: order.id },
          include: {
            items: { include: { addons: true } },
            table: true,
            customer: true,
          },
        });
      });

      return this.sanitizeOrderResponse(created!);
    } catch (error) {
      if (
        error instanceof Error &&
        (error as any).code === 'P2002' &&
        dto.idempotencyKey
      ) {
        const doubleCheckOrder = await this.prisma.order.findUnique({
          where: { idempotencyKey: dto.idempotencyKey },
          include: {
            items: { include: { addons: true } },
            table: true,
            customer: true,
          },
        });
        if (doubleCheckOrder) {
          return this.sanitizeOrderResponse(doubleCheckOrder);
        }
      }
      throw error;
    }
  }

  private async handleStockTransition(
    tx: Prisma.TransactionClient,
    orderId: string,
    newStatus: OrderStatus,
    userId: string,
  ) {
    if (newStatus === OrderStatus.COMPLETED) {
      const existingConsumption = await tx.orderStockConsumption.findUnique({
        where: { orderId },
      });
      if (existingConsumption) return;

      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: {
            include: {
              addons: true,
            },
          },
        },
      });

      if (!order) return;

      const ingredientsToConsume: Map<
        string,
        { quantity: Prisma.Decimal; name: string }
      > = new Map();

      for (const item of order.items) {
        let recipes: Prisma.RecipeGetPayload<{
          include: { ingredient: true };
        }>[] = [];
        if (item.variantId) {
          recipes = await tx.recipe.findMany({
            where: { variantId: item.variantId },
            include: { ingredient: true },
          });
        }
        if (recipes.length === 0) {
          recipes = await tx.recipe.findMany({
            where: { menuItemId: item.menuItemId },
            include: { ingredient: true },
          });
        }

        const addonRecipes: Prisma.RecipeGetPayload<{
          include: { ingredient: true };
        }>[] = [];
        if (item.addons && item.addons.length > 0) {
          const addonIds = item.addons.map((a) => a.addonId);
          const recipesForAddons = await tx.recipe.findMany({
            where: { addonId: { in: addonIds } },
            include: { ingredient: true },
          });
          addonRecipes.push(...recipesForAddons);
        }

        const allItemRecipes = [...recipes, ...addonRecipes];

        for (const r of allItemRecipes) {
          const totalQty = new Prisma.Decimal(r.quantity).mul(item.quantity);
          const existing = ingredientsToConsume.get(r.ingredientId);
          if (existing) {
            existing.quantity = existing.quantity.add(totalQty);
          } else {
            ingredientsToConsume.set(r.ingredientId, {
              quantity: totalQty,
              name: r.ingredient.name,
            });
          }
        }
      }

      const settings = await tx.restaurantSettings.findUnique({
        where: { id: 'default' },
      });
      const allowNegativeStock = settings?.allowNegativeStock ?? true;

      for (const [ingId, item] of ingredientsToConsume.entries()) {
        const ingredient = await tx.ingredient.findUnique({
          where: { id: ingId },
        });
        if (!ingredient) {
          throw new NotFoundException(`Ingredient not found: ${item.name}`);
        }

        const qtyToConsume = item.quantity;
        const currentStock = new Prisma.Decimal(ingredient.currentStock);
        const balanceAfter = currentStock.sub(qtyToConsume);

        if (!allowNegativeStock && balanceAfter.lt(0)) {
          throw new BadRequestException(
            `Insufficient stock for ingredient: ${ingredient.name}`,
          );
        }

        const avgCost = new Prisma.Decimal(ingredient.averageCost);
        const totalCostSnapshot = qtyToConsume.mul(avgCost);

        await tx.stockTransaction.create({
          data: {
            ingredientId: ingId,
            type: StockTxType.RECIPE_CONSUMPTION,
            quantityChange: new Prisma.Decimal(
              qtyToConsume.negated().toNumber(),
            ),
            unitCostSnapshot: new Prisma.Decimal(avgCost.toNumber()),
            totalCostSnapshot: new Prisma.Decimal(
              totalCostSnapshot.negated().toNumber(),
            ),
            balanceBefore: new Prisma.Decimal(currentStock.toNumber()),
            balanceAfter: new Prisma.Decimal(balanceAfter.toNumber()),
            averageCostBefore: new Prisma.Decimal(avgCost.toNumber()),
            averageCostAfter: new Prisma.Decimal(avgCost.toNumber()),
            referenceType: 'ORDER',
            referenceId: orderId,
            reason: `Recipe consumption for completed order: ${order.orderNumber}`,
            changedById: userId,
          },
        });

        await tx.ingredient.update({
          where: { id: ingId },
          data: {
            currentStock: new Prisma.Decimal(balanceAfter.toNumber()),
          },
        });
      }

      await tx.orderStockConsumption.create({
        data: { orderId },
      });
    }

    if (
      newStatus === OrderStatus.CANCELLED ||
      newStatus === OrderStatus.VOIDED
    ) {
      const consumption = await tx.orderStockConsumption.findUnique({
        where: { orderId },
      });
      if (!consumption) return;

      const existingReversal =
        await tx.orderStockConsumptionReversal.findUnique({
          where: { orderId },
        });
      if (existingReversal) return;

      const consumptionTxs = await tx.stockTransaction.findMany({
        where: {
          referenceType: 'ORDER',
          referenceId: orderId,
          type: StockTxType.RECIPE_CONSUMPTION,
        },
        include: {
          ingredient: true,
        },
      });

      if (consumptionTxs.length === 0) {
        throw new InternalServerErrorException(
          'Inventory integrity error: stock consumption marker exists but historical consumption transactions are missing.',
        );
      }

      for (const t of consumptionTxs) {
        const qtyToRestore = new Prisma.Decimal(t.quantityChange).abs();
        const currentStock = new Prisma.Decimal(t.ingredient.currentStock);
        const balanceAfter = currentStock.add(qtyToRestore);
        const avgCost = new Prisma.Decimal(t.ingredient.averageCost);

        await tx.stockTransaction.create({
          data: {
            ingredientId: t.ingredientId,
            type: StockTxType.CONSUMPTION_REVERSAL,
            quantityChange: new Prisma.Decimal(qtyToRestore.toNumber()),
            unitCostSnapshot: new Prisma.Decimal(t.unitCostSnapshot),
            totalCostSnapshot: new Prisma.Decimal(t.totalCostSnapshot).abs(),
            balanceBefore: new Prisma.Decimal(currentStock.toNumber()),
            balanceAfter: new Prisma.Decimal(balanceAfter.toNumber()),
            averageCostBefore: new Prisma.Decimal(avgCost.toNumber()),
            averageCostAfter: new Prisma.Decimal(avgCost.toNumber()),
            referenceType: 'ORDER',
            referenceId: orderId,
            reversesStockTransactionId: t.id,
            reason: `Consumption reversed for voided/cancelled order.`,
            changedById: userId,
          },
        });

        await tx.ingredient.update({
          where: { id: t.ingredientId },
          data: {
            currentStock: new Prisma.Decimal(balanceAfter.toNumber()),
          },
        });
      }

      await tx.orderStockConsumptionReversal.create({
        data: { orderId },
      });
    }
  }

  private async processCouponApplication(
    tx: Prisma.TransactionClient,
    couponCode: string,
    customerId: string | null,
    subtotal: number,
    billId: string,
    orderId: string,
  ): Promise<{
    couponId: string;
    couponDiscount: number;
  }> {
    const normalized = couponCode.trim().toUpperCase();
    const coupon = await tx.coupon.findUnique({
      where: { code: normalized },
    });

    if (!coupon) {
      throw new BadRequestException('Coupon code not found.');
    }
    if (!coupon.isActive) {
      throw new BadRequestException('This coupon is inactive.');
    }
    if (coupon.type === 'BIRTHDAY' || coupon.type === 'FESTIVAL') {
      throw new BadRequestException('Unsupported legacy coupon type.');
    }

    const now = new Date();
    if (now < new Date(coupon.startDate)) {
      throw new BadRequestException('This coupon is not active yet.');
    }
    if (now > new Date(coupon.endDate)) {
      throw new BadRequestException('This coupon has expired.');
    }

    if (subtotal < Number(coupon.minOrder)) {
      throw new BadRequestException(
        `Minimum order amount of ₹${Number(coupon.minOrder)} is required.`,
      );
    }

    // Atomic check: check global limit before update
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException(
        'This coupon usage limit has been reached.',
      );
    }

    // Atomic check: check customer limit before update
    if (coupon.perCustLimit !== null) {
      if (!customerId) {
        throw new BadRequestException(
          'Customer registration is required to use this coupon.',
        );
      }

      const counter = await tx.customerCouponUsageCounter.findUnique({
        where: {
          couponId_customerId: {
            couponId: coupon.id,
            customerId,
          },
        },
      });

      if (counter && counter.usageCount >= coupon.perCustLimit) {
        throw new BadRequestException(
          `You have already used this coupon the maximum allowed times (${coupon.perCustLimit}).`,
        );
      }
    }

    // Calculate coupon discount amount
    let discount = 0;
    if (coupon.type === 'FLAT') {
      discount = Number(coupon.value);
    } else if (coupon.type === 'PERCENTAGE') {
      discount = subtotal * (Number(coupon.value) / 100);
      if (coupon.maxDiscount !== null) {
        discount = Math.min(discount, Number(coupon.maxDiscount));
      }
    }
    const couponDiscount = this.roundToTwo(Math.min(discount, subtotal));

    // 1. Atomic Global Increment
    const affectedCoupon = await tx.$executeRaw`
      UPDATE \`Coupon\`
      SET \`usedCount\` = \`usedCount\` + 1
      WHERE \`id\` = ${coupon.id}
        AND \`isActive\` = true
        ${coupon.usageLimit !== null ? Prisma.raw(`AND \`usedCount\` < ${coupon.usageLimit}`) : Prisma.empty}
    `;
    if (affectedCoupon === 0) {
      throw new BadRequestException(
        'Coupon usage limit reached or coupon has been deactivated.',
      );
    }

    // 2. Atomic Customer Counter Increment
    if (coupon.perCustLimit !== null && customerId) {
      try {
        await tx.customerCouponUsageCounter.create({
          data: {
            couponId: coupon.id,
            customerId,
            usageCount: 1,
            version: 1,
          },
        });
      } catch (e) {
        if (
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === 'P2002'
        ) {
          const affectedCust = await tx.$executeRaw`
            UPDATE \`CustomerCouponUsageCounter\`
            SET \`usageCount\` = \`usageCount\` + 1, \`version\` = \`version\` + 1
            WHERE \`couponId\` = ${coupon.id}
              AND \`customerId\` = ${customerId}
              AND \`usageCount\` < ${coupon.perCustLimit}
          `;
          if (affectedCust === 0) {
            throw new BadRequestException(
              'Per-customer coupon usage limit exceeded.',
            );
          }
        } else {
          throw e;
        }
      }
    }

    // 3. Create CouponUsage record with snapshots
    await tx.couponUsage.create({
      data: {
        couponId: coupon.id,
        orderId,
        customerId,
        billId,
        couponCodeSnapshot: coupon.code,
        couponNameSnapshot: coupon.name,
        discountTypeSnapshot: coupon.type,
        discountValueSnapshot: coupon.value,
        maximumDiscountSnapshot: coupon.maxDiscount,
        appliedDiscountSnapshot: new Prisma.Decimal(couponDiscount),
        status: 'ACTIVE',
      },
    });

    return {
      couponId: coupon.id,
      couponDiscount,
    };
  }

  private async reverseCouponEffects(
    tx: Prisma.TransactionClient,
    orderId: string,
  ) {
    const couponUsage = await tx.couponUsage.findFirst({
      where: { orderId, status: 'ACTIVE' },
    });

    if (!couponUsage) {
      return;
    }

    const affected = await tx.$executeRaw`
      UPDATE \`CouponUsage\`
      SET \`status\` = 'REVERSED', \`reversedAt\` = NOW()
      WHERE \`id\` = ${couponUsage.id}
        AND \`status\` = 'ACTIVE'
    `;

    if (affected === 0) {
      return;
    }

    const affectedGlobal = await tx.$executeRaw`
      UPDATE \`Coupon\`
      SET \`usedCount\` = \`usedCount\` - 1
      WHERE \`id\` = ${couponUsage.couponId}
        AND \`usedCount\` > 0
    `;
    if (affectedGlobal === 0) {
      throw new InternalServerErrorException(
        'Failed to decrement global coupon count: integrity error.',
      );
    }

    if (couponUsage.customerId) {
      const affectedCust = await tx.$executeRaw`
        UPDATE \`CustomerCouponUsageCounter\`
        SET \`usageCount\` = \`usageCount\` - 1, \`version\` = \`version\` + 1
        WHERE \`couponId\` = ${couponUsage.couponId}
          AND \`customerId\` = ${couponUsage.customerId}
          AND \`usageCount\` > 0
      `;
      if (affectedCust === 0) {
        throw new InternalServerErrorException(
          'Failed to decrement customer coupon usage counter: integrity error.',
        );
      }
    }
  }

  private async handleTableSessionAndBill(
    tx: any,
    tableId: string | null,
    orderId: string,
    calcResult: any,
    settings: any,
  ) {
    if (!tableId) {
      return tx.bill.create({
        data: {
          invoiceNumber: null,
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          orderId,
          subtotal: calcResult.subtotal,
          discount: calcResult.discount,
          itemDiscount: 0.0,
          couponDiscount: calcResult.couponDiscount,
          manualDiscount: calcResult.manualDiscount,
          totalDiscount: calcResult.discount,
          taxableAmount: calcResult.taxableAmount,
          cgst: calcResult.cgst,
          sgst: calcResult.sgst,
          serviceCharge: calcResult.serviceCharge,
          nightCharge: calcResult.nightCharge,
          roundOff: calcResult.roundOff,
          grandTotal: calcResult.grandTotal,
        },
      });
    }

    // Lock the table row to serialize concurrent table session creation checks
    await tx.restaurantTable.update({
      where: { id: tableId },
      data: { status: 'OCCUPIED' },
    });

    let session = await tx.tableSession.findFirst({
      where: { tableId, status: 'ACTIVE' },
    });

    if (!session) {
      session = await tx.tableSession.create({
        data: {
          tableId,
          status: 'ACTIVE',
        },
      });
    }

    await tx.order.update({
      where: { id: orderId },
      data: { tableSessionId: session.id },
    });

    let bill = await tx.bill.findFirst({
      where: { tableSessionId: session.id, status: 'DRAFT' },
    });

    if (bill) {
      const newSubtotal = Number(bill.subtotal) + Number(calcResult.subtotal);

      const mergedCalc = this.calcService.calculate({
        subtotal: newSubtotal,
        manualDiscount: Number(bill.manualDiscount),
        couponDiscount: Number(bill.couponDiscount),
        settings,
      });

      bill = await tx.bill.update({
        where: { id: bill.id },
        data: {
          subtotal: mergedCalc.subtotal,
          discount: mergedCalc.discount,
          totalDiscount: mergedCalc.discount,
          taxableAmount: mergedCalc.taxableAmount,
          cgst: mergedCalc.cgst,
          sgst: mergedCalc.sgst,
          serviceCharge: mergedCalc.serviceCharge,
          nightCharge: mergedCalc.nightCharge,
          roundOff: mergedCalc.roundOff,
          grandTotal: mergedCalc.grandTotal,
        },
      });
    } else {
      bill = await tx.bill.create({
        data: {
          invoiceNumber: null,
          status: 'DRAFT',
          paymentStatus: 'UNPAID',
          orderId,
          tableSessionId: session.id,
          subtotal: calcResult.subtotal,
          discount: calcResult.discount,
          itemDiscount: 0.0,
          couponDiscount: calcResult.couponDiscount,
          manualDiscount: calcResult.manualDiscount,
          totalDiscount: calcResult.discount,
          taxableAmount: calcResult.taxableAmount,
          cgst: calcResult.cgst,
          sgst: calcResult.sgst,
          serviceCharge: calcResult.serviceCharge,
          nightCharge: calcResult.nightCharge,
          roundOff: calcResult.roundOff,
          grandTotal: calcResult.grandTotal,
        },
      });
    }

    return bill;
  }

  // ==========================================
  // CUSTOMER PERSISTENT CART METHODS
  // ==========================================

  async getCart(tableId: string) {
    let cart = await this.prisma.customerCart.findUnique({
      where: { tableId },
      include: {
        items: {
          include: {
            menuItem: {
              include: {
                variants: true,
                menuItemAddons: {
                  include: { addon: true },
                },
              },
            },
            variant: true,
          },
        },
      },
    });

    if (!cart) {
      cart = await this.prisma.customerCart.create({
        data: { tableId },
        include: {
          items: {
            include: {
              menuItem: {
                include: {
                  variants: true,
                  menuItemAddons: {
                    include: { addon: true },
                  },
                },
              },
              variant: true,
            },
          },
        },
      });
    }

    const items = cart.items.map((item) => {
      const addonIdsArray = item.addonIds ? item.addonIds.split(',').filter(Boolean) : [];
      const resolvedAddons = item.menuItem.menuItemAddons
        .map((ma) => ma.addon)
        .filter((a) => addonIdsArray.includes(a.id))
        .map((a) => ({
          id: a.id,
          name: a.name,
          price: a.price.toString(),
        }));

      return {
        id: item.id,
        menuItem: {
          id: item.menuItem.id,
          name: item.menuItem.name,
          description: item.menuItem.description,
          basePrice: item.menuItem.basePrice.toString(),
          image: item.menuItem.image,
          isVeg: item.menuItem.isVeg,
          available: item.menuItem.available,
          popular: item.menuItem.popular,
          recommended: item.menuItem.recommended,
          bestSeller: item.menuItem.bestSeller,
          prepTime: item.menuItem.prepTime,
          variants: item.menuItem.variants.map((v) => ({
            id: v.id,
            name: v.name,
            price: v.price.toString(),
          })),
        },
        selectedVariant: item.variant
          ? {
              id: item.variant.id,
              name: item.variant.name,
              price: item.variant.price.toString(),
            }
          : undefined,
        selectedAddons: resolvedAddons,
        quantity: item.quantity,
        notes: item.notes || '',
      };
    });

    return {
      id: cart.id,
      tableId: cart.tableId,
      items,
    };
  }

  async updateCartItem(
    tableId: string,
    menuItemId: string,
    variantId: string | null,
    addonIds: string[],
    quantity: number,
    notes?: string,
  ) {
    let cart = await this.prisma.customerCart.findUnique({
      where: { tableId },
    });

    if (!cart) {
      cart = await this.prisma.customerCart.create({
        data: { tableId },
      });
    }

    const addonIdsStr = addonIds.sort().join(',');

    const existingItem = await this.prisma.customerCartItem.findFirst({
      where: {
        cartId: cart.id,
        menuItemId,
        variantId: variantId || null,
        addonIds: addonIdsStr,
      },
    });

    if (existingItem) {
      if (quantity <= 0) {
        await this.prisma.customerCartItem.delete({
          where: { id: existingItem.id },
        });
      } else {
        await this.prisma.customerCartItem.update({
          where: { id: existingItem.id },
          data: { quantity, notes: notes || null },
        });
      }
    } else if (quantity > 0) {
      await this.prisma.customerCartItem.create({
        data: {
          cartId: cart.id,
          menuItemId,
          variantId: variantId || null,
          addonIds: addonIdsStr,
          quantity,
          notes: notes || null,
        },
      });
    }

    return this.getCart(tableId);
  }

  async clearCart(tableId: string) {
    const cart = await this.prisma.customerCart.findUnique({
      where: { tableId },
    });

    if (cart) {
      await this.prisma.customerCartItem.deleteMany({
        where: { cartId: cart.id },
      });
    }

    return { success: true };
  }

  async syncCart(
    tableId: string,
    items: Array<{
      menuItemId: string;
      variantId?: string;
      addonIds: string[];
      quantity: number;
      notes?: string;
    }>,
  ) {
    let cart = await this.prisma.customerCart.findUnique({
      where: { tableId },
    });

    if (!cart) {
      cart = await this.prisma.customerCart.create({
        data: { tableId },
      });
    }

    await this.prisma.customerCartItem.deleteMany({
      where: { cartId: cart.id },
    });

    for (const item of items) {
      if (item.quantity > 0) {
        await this.prisma.customerCartItem.create({
          data: {
            cartId: cart.id,
            menuItemId: item.menuItemId,
            variantId: item.variantId || null,
            addonIds: item.addonIds.sort().join(','),
            quantity: item.quantity,
            notes: item.notes || null,
          },
        });
      }
    }

    return this.getCart(tableId);
  }

  async getActiveTrackingTokenForTable(tableId: string) {
    const activeSession = await this.prisma.tableSession.findFirst({
      where: { tableId, status: 'ACTIVE' },
    });

    if (!activeSession) {
      return { trackingToken: null };
    }

    const latestOrder = await this.prisma.order.findFirst({
      where: {
        tableSessionId: activeSession.id,
        status: { notIn: ['CANCELLED', 'VOIDED', 'COMPLETED'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { publicTrackingToken: true },
    });

    return { trackingToken: latestOrder?.publicTrackingToken || null };
  }
}
