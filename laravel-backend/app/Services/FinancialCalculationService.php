<?php

namespace App\Services;

use App\Models\RestaurantSettings;

class FinancialCalculationService
{
    public function calculate(array $params): array
    {
        $subtotal = round((float)($params['subtotal'] ?? 0), 2);
        $manualDiscount = round((float)($params['manualDiscount'] ?? 0), 2);
        $couponDiscount = round((float)($params['couponDiscount'] ?? 0), 2);
        $loyaltyDiscount = round((float)($params['loyaltyDiscount'] ?? 0), 2);

        $totalDiscount = round($manualDiscount + $couponDiscount + $loyaltyDiscount, 2);
        if ($totalDiscount > $subtotal) {
            $totalDiscount = $subtotal;
        }

        $baseTaxable = round($subtotal - $totalDiscount, 2);

        $settings = array_key_exists('settings', $params) ? $params['settings'] : null;
        $gstRate = $settings ? (float)$settings->gstPercentage : 5.0;
        $cgstRate = $settings ? (float)$settings->cgstPercentage : 2.5;
        $sgstRate = $settings ? (float)$settings->sgstPercentage : 2.5;
        $enableGst = $settings ? (bool)$settings->enableGst : true;

        $cgst = 0.0;
        $sgst = 0.0;
        $taxableAmount = $baseTaxable;

        if ($enableGst && $baseTaxable > 0) {
            $taxableAmount = round($baseTaxable / (1 + ($gstRate / 100)), 2);
            $cgst = round($taxableAmount * ($cgstRate / 100), 2);
            $sgst = round($taxableAmount * ($sgstRate / 100), 2);
        }

        $serviceCharge = 0.0;
        if ($settings && $settings->enableServiceCharge && (float)$settings->serviceChargePercentage > 0) {
            $serviceCharge = round($subtotal * ((float)$settings->serviceChargePercentage / 100), 2);
        }

        $nightCharge = 0.0;
        if ($settings && $settings->enableNightCharges) {
            if ($settings->nightChargeType === 'PERCENTAGE') {
                $nightCharge = round($subtotal * ((float)$settings->nightChargeValue / 100), 2);
            } else {
                $nightCharge = round((float)$settings->nightChargeValue, 2);
            }
        }

        $preRoundGrandTotal = round($baseTaxable + $serviceCharge + $nightCharge, 2);
        $grandTotal = (float)round($preRoundGrandTotal);
        $roundOff = round($grandTotal - $preRoundGrandTotal, 2);

        return [
            'subtotal' => $subtotal,
            'manualDiscount' => $manualDiscount,
            'couponDiscount' => $couponDiscount,
            'loyaltyDiscount' => $loyaltyDiscount,
            'discount' => $totalDiscount,
            'baseTaxableAmount' => $baseTaxable,
            'taxableAmount' => $taxableAmount,
            'cgst' => $cgst,
            'sgst' => $sgst,
            'serviceCharge' => $serviceCharge,
            'nightCharge' => $nightCharge,
            'preRoundGrandTotal' => $preRoundGrandTotal,
            'roundOff' => $roundOff,
            'grandTotal' => $grandTotal,
        ];
    }
}
