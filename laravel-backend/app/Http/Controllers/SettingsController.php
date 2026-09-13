<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\RestaurantSettings;

class SettingsController extends Controller
{
    public function show()
    {
        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            $settings = RestaurantSettings::create(['id' => 'default', 'name' => 'Cafe Cue & Brew']);
        }
        return response()->json($settings);
    }

    public function update(Request $request)
    {
        $settings = RestaurantSettings::find('default');
        if (!$settings) {
            $settings = RestaurantSettings::create(['id' => 'default']);
        }
        $data = $request->only([
            'name',
            'logo',
            'tagline',
            'address',
            'phone',
            'whatsAppNumber',
            'email',
            'openingTime',
            'closingTime',
            'currency',
            'timezone',
            'enableCash',
            'enableUpi',
            'enableCard',
            'enableCredit',
            'upiId',
            'enableRoundOff',
            'enableServiceCharge',
            'serviceChargePercentage',
            'invoicePrefix',
            'enableGst',
            'gstPercentage',
            'cgstPercentage',
            'sgstPercentage',
            'gstin',
            'taxInclusivePricing',
            'enableNightCharges',
            'nightStart',
            'nightEnd',
            'nightChargeType',
            'nightChargeValue',
            'cashierMaxDiscountPercent',
            'managerMaxDiscountPercent',
            'managerCanViewFinancialAnalytics',
            'managerCanViewFinancialReports',
            'qrOrderingEnabled',
            'requireCustomerName',
            'requireCustomerPhone',
            'manualAcceptQrOrders',
            'managerCanViewCustomerCRM',
            'managerCanManageCustomerCRM',
            'newCustomerWindowDays',
            'regularCustomerVisitThreshold',
            'vipCustomerSpendThreshold',
            'highSpenderAverageSpendThreshold',
            'atRiskDays',
            'inactiveDays',
            'enableLoyalty',
            'loyaltySpendAmount',
            'loyaltyPointsEarned',
            'loyaltyRedemptionPoints',
            'loyaltyRedemptionValue',
            'loyaltyMinimumRedeemPoints',
            'loyaltyMaximumRedeemPercent',
            'loyaltyRedemptionRequestExpiryMinutes',
            'managerCanAdjustLoyaltyPoints',
            'managerCanApproveLoyaltyRedemption',
            'managerCanManageCoupons',
        ]);

        $settings->update($data);
        return response()->json($settings);
    }
}
