<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Staff;
use App\Models\StaffSession;
use App\Models\Category;
use App\Models\MenuItem;
use App\Models\MenuVariant;
use App\Models\Addon;
use App\Models\MenuItemAddon;
use App\Models\RestaurantTable;
use App\Models\CustomerCart;
use App\Models\CustomerCartItem;
use App\Models\TableQrToken;
use App\Models\WaiterCall;
use App\Models\Order;
use App\Models\RestaurantSettings;
use App\Support\JwtHelper;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class Phase32MenuCategoriesTablesQROrderingTest extends TestCase
{
    protected $owner;
    protected $waiter;
    protected $ownerToken;
    protected $waiterToken;

    protected function setUp(): void
    {
        parent::setUp();

        RestaurantSettings::updateOrCreate(
            ['id' => 'default'],
            [
                'restaurantName' => 'Café Cue & Brew',
                'qrOrderingEnabled' => true,
                'requireCustomerName' => true,
                'requireCustomerPhone' => true,
                'allowAddons' => true,
                'enableGst' => true,
                'gstPercentage' => 5.0,
                'cgstPercentage' => 2.5,
                'sgstPercentage' => 2.5,
                'pinLength' => 4,
            ]
        );

        $ownerId = (string)Str::uuid();
        $this->owner = Staff::create([
            'id' => $ownerId,
            'name' => 'Owner Phase32',
            'phone' => '+919' . rand(100000000, 999999999),
            'role' => 'OWNER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);
        $ownerSid = (string)Str::uuid();
        $this->ownerToken = JwtHelper::generateToken(['sub' => $ownerId, 'role' => 'OWNER', 'sid' => $ownerSid], env('JWT_SECRET', 'dev-secret-key'));
        StaffSession::create(['id' => $ownerSid, 'staffId' => $ownerId, 'token' => hash('sha256', $this->ownerToken), 'expiredAt' => date('Y-m-d H:i:s', time() + 43200), 'isActive' => true, 'createdAt' => date('Y-m-d H:i:s')]);

        $waiterId = (string)Str::uuid();
        $this->waiter = Staff::create([
            'id' => $waiterId,
            'name' => 'Waiter Phase32',
            'phone' => '+919' . rand(100000000, 999999999),
            'role' => 'WAITER',
            'pinHash' => Hash::make('1234'),
            'status' => 'ACTIVE',
        ]);
        $waiterSid = (string)Str::uuid();
        $this->waiterToken = JwtHelper::generateToken(['sub' => $waiterId, 'role' => 'WAITER', 'sid' => $waiterSid], env('JWT_SECRET', 'dev-secret-key'));
        StaffSession::create(['id' => $waiterSid, 'staffId' => $waiterId, 'token' => hash('sha256', $this->waiterToken), 'expiredAt' => date('Y-m-d H:i:s', time() + 43200), 'isActive' => true, 'createdAt' => date('Y-m-d H:i:s')]);
    }

    protected function tearDown(): void
    {
        if ($this->owner) {
            $this->owner->sessions()->delete();
            $this->owner->delete();
        }
        if ($this->waiter) {
            $this->waiter->sessions()->delete();
            $this->waiter->delete();
        }
        parent::tearDown();
    }

    // ==========================================
    // A. CATEGORIES TESTS
    // ==========================================

    public function test_categories_crud_and_authorization()
    {
        // Staff listing
        $res = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->getJson('/api/categories?all=true');
        $res->assertStatus(200);

        // WAITER unauthorized creation
        $unauthRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->postJson('/api/categories', ['name' => 'Test Cat Unauth']);
        $unauthRes->assertStatus(403);

        // OWNER create
        $createRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/categories', [
            'name' => 'Test Category P32 ' . rand(1000, 9999),
            'displayOrder' => 1,
        ]);
        $createRes->assertStatus(201);
        $catId = $createRes->json('id');

        // OWNER update
        $updateRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->putJson('/api/categories/' . $catId, [
            'name' => 'Updated Category P32 ' . rand(1000, 9999),
        ]);
        $updateRes->assertStatus(200);

        // OWNER delete
        $delRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->deleteJson('/api/categories/' . $catId);
        $delRes->assertStatus(200);
    }

    // ==========================================
    // B. MENU & ADDONS TESTS
    // ==========================================

    public function test_menu_and_addons_crud_and_bulk_update()
    {
        // Create Category
        $cat = Category::create(['id' => (string)Str::uuid(), 'name' => 'Cat Menu Test ' . rand(1000, 9999), 'displayOrder' => 1, 'isActive' => true]);

        // Create Addon
        $addonRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/menu/addons', [
            'name' => 'Extra Cheese P32 ' . rand(1000, 9999),
            'price' => 30.00,
        ]);
        $addonRes->assertStatus(201);
        $addonId = $addonRes->json('id');

        // Create Menu Item with Variant & Addon
        $itemRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/menu/items', [
            'name' => 'Cappuccino P32 ' . rand(1000, 9999),
            'categoryId' => $cat->id,
            'basePrice' => 150.00,
            'variants' => [
                ['name' => 'Large', 'price' => 190.00]
            ],
            'addonIds' => [$addonId],
        ]);
        $itemRes->assertStatus(201);
        $itemId = $itemRes->json('id');

        // Bulk price update (10% increase)
        $bulkRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/menu/items/bulk-price-update', [
            'updateType' => 'PERCENTAGE',
            'action' => 'INCREASE',
            'value' => 10,
            'categoryId' => $cat->id,
        ]);
        $bulkRes->assertStatus(200);

        $item = MenuItem::find($itemId);
        $this->assertEquals(165.00, (float)$item->basePrice);

        // Clean up
        MenuItemAddon::where('menuItemId', $itemId)->delete();
        MenuVariant::where('menuItemId', $itemId)->delete();
        MenuItem::where('id', $itemId)->delete();
        Addon::where('id', $addonId)->delete();
        $cat->delete();
    }

    // ==========================================
    // C. PUBLIC MENU TESTS
    // ==========================================

    public function test_public_menu_settings_categories()
    {
        $resSettings = $this->getJson('/api/public/settings');
        $resSettings->assertStatus(200)
            ->assertJsonStructure(['restaurantName', 'qrOrderingEnabled']);

        $resCats = $this->getJson('/api/public/categories');
        $resCats->assertStatus(200);

        $resMenu = $this->getJson('/api/public/menu');
        $resMenu->assertStatus(200);
    }

    // ==========================================
    // D & E. TABLES & PUBLIC LOOKUP TESTS
    // ==========================================

    public function test_table_management_and_public_token_lookup()
    {
        $tableNum = 'T-P32-' . rand(100, 999);
        $createRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/tables', [
            'tableNumber' => $tableNum,
            'capacity' => 4,
        ]);
        $createRes->assertStatus(201);
        $tableId = $createRes->json('id');
        $qrToken = TableQrToken::where('tableId', $tableId)->first();

        // Public Token Lookup
        $publicRes = $this->getJson('/api/tables/token/' . $qrToken->token);
        $publicRes->assertStatus(200)
            ->assertJson([
                'id' => $tableId,
                'tableNumber' => $tableNum,
                'capacity' => 4,
            ])
            ->assertJsonMissing(['qrToken', 'pinHash', 'token']); // Sensitive fields hidden

        // Regenerate Token
        $regenRes = $this->withHeader('Authorization', 'Bearer ' . $this->ownerToken)->postJson('/api/tables/' . $tableId . '/qr-token');
        $regenRes->assertStatus(200)
            ->assertJsonStructure(['token']);

        // Clean up
        TableQrToken::where('tableId', $tableId)->delete();
        RestaurantTable::where('id', $tableId)->delete();
    }

    // ==========================================
    // F. WAITER CALLS TESTS
    // ==========================================

    public function test_waiter_calls_flow()
    {
        $table = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'WC-T' . rand(100, 999),
            'capacity' => 2,
            'status' => 'OCCUPIED',
            'isActive' => true,
        ]);

        $token = 'CCB_TBL_WAITER_' . Str::random(12);

        TableQrToken::create([
            'id' => (string)Str::uuid(),
            'tableId' => $table->id,
            'token' => $token,
            'createdAt' => now(),
        ]);

        // Public Customer Call Waiter
        $callRes = $this->postJson('/api/public/tables/' . $table->id . '/call-waiter', [
            'token' => $token,
        ]);
        $callRes->assertStatus(201);
        $callId = $callRes->json('id');

        // Staff List Calls
        $listRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->getJson('/api/waiter-calls');
        $listRes->assertStatus(200);

        // Staff Acknowledge
        $ackRes = $this->withHeader('Authorization', 'Bearer ' . $this->waiterToken)->patchJson('/api/waiter-calls/' . $callId . '/acknowledge');
        $ackRes->assertStatus(200);

        // Clean up
        WaiterCall::where('id', $callId)->delete();
        TableQrToken::where('tableId', $table->id)->delete();
        $table->delete();
    }

    // ==========================================
    // G. PUBLIC QR ORDERING & SERVER PRICING TAMPER TEST
    // ==========================================

    public function test_public_cart_and_active_token_require_matching_table_qr_token(): void
    {
        $tableA = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'CART-A-' . Str::random(8),
            'capacity' => 2,
            'status' => 'OCCUPIED',
            'isActive' => true,
        ]);

        $tableB = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'CART-B-' . Str::random(8),
            'capacity' => 2,
            'status' => 'OCCUPIED',
            'isActive' => true,
        ]);

        $tokenA = 'CCB_TBL_A_' . Str::random(16);
        $tokenB = 'CCB_TBL_B_' . Str::random(16);

        TableQrToken::create([
            'id' => (string)Str::uuid(),
            'tableId' => $tableA->id,
            'token' => $tokenA,
            'createdAt' => now(),
        ]);

        TableQrToken::create([
            'id' => (string)Str::uuid(),
            'tableId' => $tableB->id,
            'token' => $tokenB,
            'createdAt' => now(),
        ]);

        $category = Category::create([
            'id' => (string)Str::uuid(),
            'name' => 'QR Cart Security Category ' . Str::random(8),
            'displayOrder' => 1,
            'isActive' => true,
        ]);

        $menuItem = MenuItem::create([
            'id' => (string)Str::uuid(),
            'categoryId' => $category->id,
            'name' => 'QR Cart Security Item ' . Str::random(8),
            'basePrice' => 100.00,
            'available' => true,
        ]);

        $cartB = CustomerCart::create([
            'id' => (string)Str::uuid(),
            'tableId' => $tableB->id,
        ]);

        // Table A token must not read Table B's cart.
        $getRes = $this->getJson(
            '/api/public/orders/cart/' . $tableB->id . '?token=' . urlencode($tokenA)
        );

        $getRes->assertStatus(400)
            ->assertJson([
                'message' => 'Invalid or expired table QR token.',
                'statusCode' => 400,
            ]);

        // Table A token must not modify Table B's cart.
        $updateRes = $this->postJson('/api/public/orders/cart/' . $tableB->id, [
            'token' => $tokenA,
            'menuItemId' => $menuItem->id,
            'quantity' => 9,
            'notes' => 'unauthorized cart change',
        ]);

        $updateRes->assertStatus(400)
            ->assertJson([
                'message' => 'Invalid or expired table QR token.',
                'statusCode' => 400,
            ]);

        $this->assertDatabaseMissing('CustomerCartItem', [
            'cartId' => $cartB->id,
        ]);

        // Table A token must not obtain Table B's active tracking token.
        $activeTokenRes = $this->getJson(
            '/api/public/orders/active-token/' . $tableB->id . '?token=' . urlencode($tokenA)
        );

        $activeTokenRes->assertStatus(400)
            ->assertJson([
                'message' => 'Invalid or expired table QR token.',
                'statusCode' => 400,
            ]);

        // Valid Table B token must still be accepted.
        $validCartRes = $this->getJson(
            '/api/public/orders/cart/' . $tableB->id . '?token=' . urlencode($tokenB)
        );

        $validCartRes->assertStatus(200);

        // Cleanup.
        CustomerCartItem::where('cartId', $cartB->id)->delete();
        $cartB->delete();
        TableQrToken::whereIn('tableId', [$tableA->id, $tableB->id])->delete();
        $tableA->delete();
        $tableB->delete();
        $menuItem->delete();
        $category->delete();
    }

    public function test_public_sync_and_clear_cart_require_matching_table_qr_token(): void
    {
        $tableA = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'SYNC-A-' . Str::random(8),
            'capacity' => 2,
            'status' => 'OCCUPIED',
            'isActive' => true,
        ]);

        $tableB = RestaurantTable::create([
            'id' => (string)Str::uuid(),
            'tableNumber' => 'SYNC-B-' . Str::random(8),
            'capacity' => 2,
            'status' => 'OCCUPIED',
            'isActive' => true,
        ]);

        $tokenA = 'CCB_TBL_SYNC_A_' . Str::random(16);
        $tokenB = 'CCB_TBL_SYNC_B_' . Str::random(16);

        TableQrToken::create([
            'id' => (string)Str::uuid(),
            'tableId' => $tableA->id,
            'token' => $tokenA,
            'createdAt' => now(),
        ]);

        TableQrToken::create([
            'id' => (string)Str::uuid(),
            'tableId' => $tableB->id,
            'token' => $tokenB,
            'createdAt' => now(),
        ]);

        $category = Category::create([
            'id' => (string)Str::uuid(),
            'name' => 'QR Sync Security Category ' . Str::random(8),
            'displayOrder' => 1,
            'isActive' => true,
        ]);

        $menuItem = MenuItem::create([
            'id' => (string)Str::uuid(),
            'categoryId' => $category->id,
            'name' => 'QR Sync Security Item ' . Str::random(8),
            'basePrice' => 100.00,
            'available' => true,
        ]);

        $cartB = CustomerCart::create([
            'id' => (string)Str::uuid(),
            'tableId' => $tableB->id,
        ]);

        $existingItemId = (string)Str::uuid();

        CustomerCartItem::create([
            'id' => $existingItemId,
            'cartId' => $cartB->id,
            'menuItemId' => (string)Str::uuid(),
            'variantId' => null,
            'addonIds' => json_encode([]),
            'quantity' => 2,
            'notes' => 'original cart item',
        ]);

        // Wrong QR token must not sync/replace Table B's cart.
        $syncRes = $this->putJson('/api/public/orders/cart/' . $tableB->id, [
            'token' => $tokenA,
            'items' => [
                [
                    'menuItemId' => $menuItem->id,
                    'quantity' => 1,
                ],
            ],
        ]);

        $syncRes->assertStatus(400)
            ->assertJson([
                'message' => 'Invalid or expired table QR token.',
                'statusCode' => 400,
            ]);

        $this->assertDatabaseHas('CustomerCartItem', [
            'id' => $existingItemId,
            'cartId' => $cartB->id,
            'quantity' => 2,
        ]);

        // Wrong QR token must not clear Table B's cart.
        $clearRes = $this->deleteJson('/api/public/orders/cart/' . $tableB->id, [
            'token' => $tokenA,
        ]);

        $clearRes->assertStatus(400)
            ->assertJson([
                'message' => 'Invalid or expired table QR token.',
                'statusCode' => 400,
            ]);

        $this->assertDatabaseHas('CustomerCartItem', [
            'id' => $existingItemId,
            'cartId' => $cartB->id,
            'quantity' => 2,
        ]);

        // Correct QR token must still be able to clear the cart.
        $validClearRes = $this->deleteJson('/api/public/orders/cart/' . $tableB->id, [
            'token' => $tokenB,
        ]);

        $validClearRes->assertStatus(200);

        $this->assertDatabaseMissing('CustomerCartItem', [
            'id' => $existingItemId,
        ]);

        // Cleanup.
        $cartB->delete();
        TableQrToken::whereIn('tableId', [$tableA->id, $tableB->id])->delete();
        $tableA->delete();
        $tableB->delete();
        $menuItem->delete();
        $category->delete();
    }

    public function test_public_qr_ordering_rejects_client_price_tampering()
    {
        $cat = Category::create(['id' => (string)Str::uuid(), 'name' => 'QR Order Cat ' . rand(1000, 9999), 'displayOrder' => 1, 'isActive' => true]);
        $menuItem = MenuItem::create([
            'id' => (string)Str::uuid(),
            'name' => 'Tamper Test Cold Coffee ' . rand(1000, 9999),
            'categoryId' => $cat->id,
            'basePrice' => 200.00,
            'available' => true,
            'isActive' => true,
        ]);

        $tableId = (string)Str::uuid();
        $table = RestaurantTable::create([
            'id' => $tableId,
            'tableNumber' => 'QR-T' . rand(100, 999),
            'capacity' => 4,
            'status' => 'AVAILABLE',
            'isActive' => true,
        ]);
        $tokenStr = 'CCB_TBL_TEST_' . Str::random(10);
        TableQrToken::create(['id' => (string)Str::uuid(), 'tableId' => $tableId, 'token' => $tokenStr, 'createdAt' => now()]);

        // Submit order trying to tamper price to 1.00 rupees in client payload
        $orderRes = $this->postJson('/api/public/orders', [
            'tableId' => $tableId,
            'token' => $tokenStr,
            'customerName' => 'Alice Customer',
            'customerPhone' => '9876543210',
            'items' => [
                [
                    'menuItemId' => $menuItem->id,
                    'quantity' => 2,
                    'price' => 1.00, // Attacker attempts price tampering
                ]
            ],
            'idempotencyKey' => (string)Str::uuid(),
        ]);

        $orderRes->assertStatus(201);
        $orderData = $orderRes->json();

        // Server MUST override 1.00 with database base price 200.00 (subtotal 400.00)
        $this->assertEquals(400.00, (float)$orderData['subtotal']);

        // Test Order Tracking Token
        $trackRes = $this->getJson('/api/public/orders/track/' . $orderData['trackingToken']);
        $trackRes->assertStatus(200)
            ->assertJson(['id' => $orderData['id']]);

        // Clean up
        if (!empty($orderData['id'])) {
            Order::find($orderData['id'])->items()->delete();
            Order::find($orderData['id'])->delete();
        }
        TableQrToken::where('tableId', $tableId)->delete();
        $table->delete();
        $menuItem->delete();
        $cat->delete();
    }
}
