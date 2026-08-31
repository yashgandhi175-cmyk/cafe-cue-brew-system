<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class RestaurantSettings extends Model
{
    protected $table = 'RestaurantSettings';
    protected $keyType = 'string';
    public $incrementing = false;
    const CREATED_AT = null;
    const UPDATED_AT = 'updatedAt';

    protected $fillable = [
        'id',
        'name', 'logo', 'tagline', 'address', 'phone', 'whatsAppNumber', 'email', 'openingTime', 'closingTime', 'currency', 'timezone', 'enableCash', 'enableUpi', 'enableCard', 'enableCredit', 'upiId', 'upiQrImage', 'enableRoundOff', 'enableServiceCharge', 'serviceChargePercentage', 'invoicePrefix', 'enableGst', 'gstPercentage', 'cgstPercentage', 'sgstPercentage', 'gstin', 'taxInclusivePricing', 'enableNightCharges', 'nightStart', 'nightEnd', 'nightChargeType', 'nightChargeValue', 'cashierMaxDiscountPercent', 'managerMaxDiscountPercent', 'managerCanViewFinancialAnalytics', 'managerCanViewFinancialReports', 'qrOrderingEnabled', 'requireCustomerName', 'requireCustomerPhone', 'manualAcceptQrOrders', 'allowCustomerNotes', 'allowAddons', 'allowCustomerCancellation', 'customerCancellationTimeLimit', 'trackOrderTimeline', 'trackStaffActions', 'trackCancellationReasons', 'trackOrderSource', 'enableQrMenu', 'showOfferCarousel', 'carouselRotationSeconds', 'showPopularItems', 'showBestSellers', 'showRecommendedItems', 'showPreparationTime', 'showVegNonVeg', 'showUnavailableItems', 'enableCallWaiter', 'pinLength', 'sessionTimeout', 'maxFailedAttempts', 'accountLockDuration', 'trackLoginHistory', 'trackStaffActivity', 'enableNewOrderSound', 'enableWaiterCallSound', 'enableLowStockAlerts', 'newOrderPollInterval', 'waiterCallPollInterval', 'customerOrderStatusPollInterval', 'ownerDashboardRefreshInterval', 'allowNegativeStock', 'managerCanManageInventory', 'managerCanViewInventoryCost', 'managerCanManageExpenses', 'managerCanViewProfitEstimate', 'managerCanViewCustomerCRM', 'managerCanManageCustomerCRM', 'newCustomerWindowDays', 'regularCustomerVisitThreshold', 'vipCustomerSpendThreshold', 'highSpenderAverageSpendThreshold', 'atRiskDays', 'inactiveDays', 'enableLoyalty', 'loyaltySpendAmount', 'loyaltyPointsEarned', 'loyaltyRedemptionPoints', 'loyaltyRedemptionValue', 'loyaltyMinimumRedeemPoints', 'loyaltyMaximumRedeemPercent', 'loyaltyRedemptionRequestExpiryMinutes', 'managerCanAdjustLoyaltyPoints', 'managerCanApproveLoyaltyRedemption', 'managerCanManageCoupons'
    ];

    protected $casts = [
        'enableCash' => 'boolean',
        'enableUpi' => 'boolean',
        'enableCard' => 'boolean',
        'enableCredit' => 'boolean',
        'enableRoundOff' => 'boolean',
        'enableServiceCharge' => 'boolean',
        'serviceChargePercentage' => 'decimal:2',
        'enableGst' => 'boolean',
        'gstPercentage' => 'decimal:2',
        'cgstPercentage' => 'decimal:2',
        'sgstPercentage' => 'decimal:2',
        'taxInclusivePricing' => 'boolean',
        'enableNightCharges' => 'boolean',
        'nightChargeValue' => 'decimal:2',
        'cashierMaxDiscountPercent' => 'decimal:2',
        'managerMaxDiscountPercent' => 'decimal:2',
        'managerCanViewFinancialAnalytics' => 'boolean',
        'managerCanViewFinancialReports' => 'boolean',
        'qrOrderingEnabled' => 'boolean',
        'requireCustomerName' => 'boolean',
        'requireCustomerPhone' => 'boolean',
        'manualAcceptQrOrders' => 'boolean',
        'allowCustomerNotes' => 'boolean',
        'allowAddons' => 'boolean',
        'allowCustomerCancellation' => 'boolean',
        'customerCancellationTimeLimit' => 'integer',
        'trackOrderTimeline' => 'boolean',
        'trackStaffActions' => 'boolean',
        'trackCancellationReasons' => 'boolean',
        'trackOrderSource' => 'boolean',
        'enableQrMenu' => 'boolean',
        'showOfferCarousel' => 'boolean',
        'carouselRotationSeconds' => 'integer',
        'showPopularItems' => 'boolean',
        'showBestSellers' => 'boolean',
        'showRecommendedItems' => 'boolean',
        'showPreparationTime' => 'boolean',
        'showVegNonVeg' => 'boolean',
        'showUnavailableItems' => 'boolean',
        'enableCallWaiter' => 'boolean',
        'pinLength' => 'integer',
        'sessionTimeout' => 'integer',
        'maxFailedAttempts' => 'integer',
        'accountLockDuration' => 'integer',
        'trackLoginHistory' => 'boolean',
        'trackStaffActivity' => 'boolean',
        'enableNewOrderSound' => 'boolean',
        'enableWaiterCallSound' => 'boolean',
        'enableLowStockAlerts' => 'boolean',
        'newOrderPollInterval' => 'integer',
        'waiterCallPollInterval' => 'integer',
        'customerOrderStatusPollInterval' => 'integer',
        'ownerDashboardRefreshInterval' => 'integer',
        'allowNegativeStock' => 'boolean',
        'managerCanManageInventory' => 'boolean',
        'managerCanViewInventoryCost' => 'boolean',
        'managerCanManageExpenses' => 'boolean',
        'managerCanViewProfitEstimate' => 'boolean',
        'managerCanViewCustomerCRM' => 'boolean',
        'managerCanManageCustomerCRM' => 'boolean',
        'vipCustomerSpendThreshold' => 'decimal:2',
        'highSpenderAverageSpendThreshold' => 'decimal:2',
        'enableLoyalty' => 'boolean',
        'loyaltySpendAmount' => 'decimal:2',
        'loyaltyPointsEarned' => 'integer',
        'loyaltyRedemptionPoints' => 'integer',
        'loyaltyRedemptionValue' => 'decimal:2',
        'loyaltyMinimumRedeemPoints' => 'integer',
        'loyaltyMaximumRedeemPercent' => 'decimal:2',
        'loyaltyRedemptionRequestExpiryMinutes' => 'integer',
        'managerCanAdjustLoyaltyPoints' => 'boolean',
        'managerCanApproveLoyaltyRedemption' => 'boolean',
        'managerCanManageCoupons' => 'boolean',
    ];
}
