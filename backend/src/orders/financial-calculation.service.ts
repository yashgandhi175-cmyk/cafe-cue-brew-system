import { Injectable } from '@nestjs/common';
import { RestaurantSettings } from '@prisma/client';

export interface CalculationResult {
  subtotal: number;
  discount: number;
  couponDiscount: number;
  manualDiscount: number;
  loyaltyDiscount: number;
  taxableAmount: number;
  baseTaxableAmount: number;
  cgst: number;
  sgst: number;
  serviceCharge: number;
  nightCharge: number;
  preRoundGrandTotal: number;
  roundOff: number;
  grandTotal: number;
}

@Injectable()
export class FinancialCalculationService {
  roundToTwo(num: number): number {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  isNightTime(startStr: string, endStr: string, timezone: string): boolean {
    try {
      const now = new Date();
      const localTimeStr = now.toLocaleTimeString('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      });
      const [nowHr, nowMin] = localTimeStr.split(':').map(Number);
      const nowVal = nowHr * 60 + nowMin;

      const [startHr, startMin] = startStr.split(':').map(Number);
      const startVal = startHr * 60 + startMin;

      const [endHr, endMin] = endStr.split(':').map(Number);
      const endVal = endHr * 60 + endMin;

      if (startVal <= endVal) {
        return nowVal >= startVal && nowVal <= endVal;
      } else {
        return nowVal >= startVal || nowVal <= endVal;
      }
    } catch {
      return false;
    }
  }

  calculate({
    subtotal,
    manualDiscount = 0,
    couponDiscount = 0,
    loyaltyDiscount = 0,
    settings,
    applyNightChargeOverride,
  }: {
    subtotal: number;
    manualDiscount?: number;
    couponDiscount?: number;
    loyaltyDiscount?: number;
    settings: RestaurantSettings;
    applyNightChargeOverride?: boolean;
  }): CalculationResult {
    const roundedSubtotal = this.roundToTwo(subtotal);

    // 1. Manual Discount (capped at subtotal)
    const actualManualDiscount = Math.min(
      this.roundToTwo(Math.max(0, manualDiscount)),
      roundedSubtotal,
    );
    const remainingAfterManual = this.roundToTwo(
      roundedSubtotal - actualManualDiscount,
    );

    // 2. Coupon Discount (capped at remaining subtotal)
    const actualCouponDiscount = Math.min(
      this.roundToTwo(Math.max(0, couponDiscount)),
      remainingAfterManual,
    );
    const remainingAfterCoupon = this.roundToTwo(
      remainingAfterManual - actualCouponDiscount,
    );

    // 3. Loyalty Discount (capped at remaining subtotal)
    const actualLoyaltyDiscount = Math.min(
      this.roundToTwo(Math.max(0, loyaltyDiscount)),
      remainingAfterCoupon,
    );

    const discount = this.roundToTwo(
      actualManualDiscount + actualCouponDiscount + actualLoyaltyDiscount,
    );

    const taxableAmount = this.roundToTwo(roundedSubtotal - discount);

    let cgst = 0;
    let sgst = 0;
    let baseTaxableAmount = taxableAmount;

    if (settings.enableGst) {
      const gstPercent = Number(settings.gstPercentage);
      const cgstPercent = Number(settings.cgstPercentage);
      const sgstPercent = Number(settings.sgstPercentage);

      if (settings.taxInclusivePricing) {
        cgst = this.roundToTwo(
          (taxableAmount * cgstPercent) / (100 + gstPercent),
        );
        sgst = this.roundToTwo(
          (taxableAmount * sgstPercent) / (100 + gstPercent),
        );
        baseTaxableAmount = this.roundToTwo(taxableAmount - (cgst + sgst));
      } else {
        cgst = this.roundToTwo(taxableAmount * (cgstPercent / 100));
        sgst = this.roundToTwo(taxableAmount * (sgstPercent / 100));
      }
    }

    let serviceCharge = 0;
    if (settings.enableServiceCharge) {
      serviceCharge = this.roundToTwo(
        baseTaxableAmount * (Number(settings.serviceChargePercentage) / 100),
      );
    }

    let nightCharge = 0;
    const shouldApplyNight =
      applyNightChargeOverride !== undefined
        ? applyNightChargeOverride
        : settings.enableNightCharges &&
          this.isNightTime(
            settings.nightStart,
            settings.nightEnd,
            settings.timezone,
          );

    if (shouldApplyNight) {
      if (settings.nightChargeType === 'FLAT') {
        nightCharge = Number(settings.nightChargeValue);
      } else {
        nightCharge = this.roundToTwo(
          baseTaxableAmount * (Number(settings.nightChargeValue) / 100),
        );
      }
    }

    const preRoundGrandTotal = this.roundToTwo(
      baseTaxableAmount + cgst + sgst + serviceCharge + nightCharge,
    );

    let grandTotal = preRoundGrandTotal;
    let roundOff = 0;

    if (settings.enableRoundOff) {
      grandTotal = Math.max(0, Math.round(preRoundGrandTotal));
      roundOff = this.roundToTwo(grandTotal - preRoundGrandTotal);
    }

    return {
      subtotal: roundedSubtotal,
      discount,
      couponDiscount: actualCouponDiscount,
      manualDiscount: actualManualDiscount,
      loyaltyDiscount: actualLoyaltyDiscount,
      taxableAmount,
      baseTaxableAmount,
      cgst,
      sgst,
      serviceCharge,
      nightCharge,
      preRoundGrandTotal,
      roundOff,
      grandTotal,
    };
  }
}
