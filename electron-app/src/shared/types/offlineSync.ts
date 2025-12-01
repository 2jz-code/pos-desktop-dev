/**
 * Offline Sync Payload Types
 *
 * This file defines the contract between:
 * - Frontend: cartGateway.buildOfflineOrderPayload() → SQLite storage
 * - Frontend: OfflineSyncService.buildIngestPayload() → Backend API
 * - Backend: sync/serializers/ingest_serializers.py → validation
 * - Backend: sync/services/offline_ingest_service.py → processing
 *
 * IMPORTANT: Keep these types in sync with backend serializers.
 * When modifying, update both this file and ingest_serializers.py.
 */

// =============================================================================
// ID TYPES - Document the actual PK types used in models
// =============================================================================

/**
 * Models using UUID primary keys:
 * - Order, OrderItem, OrderAdjustment, OrderDiscount
 * - Payment, PaymentTransaction
 * - Product, Category, Discount
 * - User, StoreLocation
 *
 * Models using integer primary keys:
 * - ModifierSet, ModifierOption
 * - Tax, ProductType
 */
export type UUID = string;
export type IntegerId = string | number; // Accept both for flexibility

// =============================================================================
// MODIFIER TYPES
// =============================================================================

/**
 * Modifier selection stored in cart item snapshot
 * Used by: cartSlice.selected_modifiers_snapshot
 */
export interface ModifierSnapshot {
  modifier_set_id: IntegerId;
  modifier_set_name: string;
  modifier_option_id: IntegerId;
  option_name: string;
  price_at_sale: number;
  quantity: number;
}

/**
 * Modifier in ingest payload (sent to backend)
 * Used by: OfflineSyncService.buildIngestPayload()
 * Backend: OfflineModifierSerializer
 *
 * NOTE: IDs are strings to match CharField serializer (accepts int or UUID as string)
 */
export interface IngestModifier {
  modifier_set_id: string;
  modifier_option_id: string;
  price_delta: number;
}

// =============================================================================
// ADJUSTMENT TYPES
// =============================================================================

/**
 * Valid adjustment types (must match backend OrderAdjustment.AdjustmentType)
 */
export type AdjustmentType =
  | 'ONE_OFF_DISCOUNT'
  | 'PRICE_OVERRIDE'
  | 'TAX_EXEMPT'
  | 'FEE_EXEMPT';

/**
 * Discount calculation type
 */
export type DiscountType = 'PERCENTAGE' | 'FIXED';

/**
 * Adjustment in stored payload and ingest payload
 * Used by: both buildOfflineOrderPayload and buildIngestPayload
 * Backend: OfflineItemAdjustmentSerializer, OfflineOrderAdjustmentSerializer
 *
 * NOTE: value is clamped to max 99999999.99 (8 digits + 2 decimal)
 */
export interface OfflineAdjustment {
  adjustment_type: AdjustmentType;
  discount_type: DiscountType | null;
  value: number; // Max: 99999999.99
  notes: string;
  approved_by_user_id: UUID | null;
  approval_pin?: string | null;
}

// =============================================================================
// ORDER ITEM TYPES
// =============================================================================

/**
 * Order item in stored offline payload
 * Used by: cartGateway.buildOfflineOrderPayload()
 */
export interface StoredOrderItem {
  product_id: UUID;
  quantity: number;
  price_at_sale: number;
  notes: string;
  selected_modifiers?: ModifierSnapshot[];
  selected_modifiers_snapshot?: ModifierSnapshot[];
  adjustments?: OfflineAdjustment[];
}

/**
 * Order item in ingest payload
 * Used by: OfflineSyncService.buildIngestPayload()
 * Backend: OfflineOrderItemSerializer
 */
export interface IngestOrderItem {
  product_id: UUID;
  quantity: number;
  price_at_sale: number;
  notes: string;
  modifiers: IngestModifier[];
  adjustments: OfflineAdjustment[];
}

// =============================================================================
// DISCOUNT TYPES
// =============================================================================

/**
 * Applied promotional discount
 * Backend: OfflineDiscountSerializer
 */
export interface OfflineDiscount {
  discount_id: UUID;
  amount: number;
}

// =============================================================================
// PAYMENT TYPES
// =============================================================================

/**
 * Payment method (offline only supports CASH currently)
 */
export type PaymentMethod = 'CASH' | 'CARD_TERMINAL' | 'GIFT_CARD';

/**
 * Payment in stored offline payload
 * Used by: cartGateway.buildOfflineOrderPayload()
 */
export interface StoredPayment {
  method: PaymentMethod;
  amount: number;
  tip: number;
  tendered?: number; // Cash tendered
}

/**
 * Payment in ingest payload
 * Used by: OfflineSyncService.buildIngestPayload()
 * Backend: OfflinePaymentSerializer
 */
export interface IngestPayment {
  method: PaymentMethod;
  amount: number;
  tip: number;
  surcharge: number;
  status: 'COMPLETED' | 'PENDING';
  transaction_id?: string | null;
  provider_response?: Record<string, unknown>;
  gift_card_code?: string | null;
  cash_tendered?: number | null;
  change_given?: number | null;
}

// =============================================================================
// INVENTORY TYPES
// =============================================================================

/**
 * Inventory delta (stock change)
 * Backend: OfflineInventoryDeltaSerializer
 */
export interface InventoryDelta {
  product_id: UUID;
  location_id: UUID;
  quantity_change: number; // Negative for deductions
  reason: string; // e.g., 'ORDER_DEDUCTION'
}

// =============================================================================
// APPROVAL TYPES
// =============================================================================

/**
 * Approval action type (maps to backend ActionType enum)
 */
export type ApprovalAction = 'DISCOUNT' | 'VOID' | 'REFUND' | 'PRICE_OVERRIDE';

/**
 * Manager approval record
 * Backend: OfflineApprovalSerializer
 */
export interface OfflineApproval {
  user_id: UUID;
  pin: string;
  action: ApprovalAction;
  reference: string;
  timestamp: string; // ISO 8601
}

// =============================================================================
// STORED PAYLOAD (SQLite offline_orders table)
// =============================================================================

/**
 * Complete offline order payload stored in SQLite
 * Created by: cartGateway.buildOfflineOrderPayload()
 * Stored in: offline_orders.payload (JSON)
 */
export interface StoredOfflineOrderPayload {
  // Order metadata
  local_order_id: string; // e.g., "local-uuid"
  order_type: 'POS';
  dining_preference: 'DINE_IN' | 'TAKE_OUT';
  store_location: UUID;
  cashier_id: UUID;

  // Customer info
  guest_first_name?: string;

  // Items
  items: StoredOrderItem[];

  // Discounts & adjustments
  discounts: OfflineDiscount[];
  adjustments: OfflineAdjustment[];

  // Totals (for verification)
  subtotal: number;
  tax_amount: number;
  total_discounts: number;
  total_adjustments: number;
  total: number;

  // Payment
  payment: StoredPayment;

  // Timestamps
  created_offline_at: string; // ISO 8601
}

// =============================================================================
// INGEST PAYLOAD (sent to /sync/offline-orders/)
// =============================================================================

/**
 * Order details nested in ingest payload
 * Backend: OfflineOrderSerializer.validate_order()
 */
export interface IngestOrderDetails {
  order_type: 'POS' | 'WEB' | 'APP' | 'DOORDASH' | 'UBER_EATS';
  dining_preference: 'DINE_IN' | 'TAKE_OUT';
  status: 'PENDING' | 'COMPLETED';
  store_location_id: UUID;
  cashier_id: UUID;
  guest_first_name: string;

  items: IngestOrderItem[];
  discounts: OfflineDiscount[];
  adjustments: OfflineAdjustment[];

  subtotal: number;
  tax: number;
  surcharge: number;
  discount_total: number;
  total: number;
}

/**
 * Complete ingest payload sent to backend
 * Created by: OfflineSyncService.buildIngestPayload()
 * Backend: OfflineOrderSerializer
 */
export interface OfflineOrderIngestPayload {
  // Operation metadata (for idempotency and auth)
  operation_id: UUID; // MUST be stable (use local_id) for idempotency
  device_id: string;
  nonce: string; // 32-char hex
  created_at: string; // ISO 8601 - MUST be fresh for auth (5 min window)
  offline_created_at: string; // ISO 8601 - actual order creation time
  dataset_versions: Record<string, string>;

  // Order details
  order: IngestOrderDetails;

  // Payments
  payments: IngestPayment[];

  // Inventory
  inventory_deltas: InventoryDelta[];

  // Approvals
  approvals: OfflineApproval[];
}

// =============================================================================
// INGEST RESPONSE
// =============================================================================

/**
 * Response from /sync/offline-orders/
 * Backend: OfflineOrderIngestResponseSerializer
 */
export interface OfflineOrderIngestResponse {
  status: 'SUCCESS' | 'CONFLICT' | 'ERROR';
  order_number?: string | null;
  order_id?: UUID | null;
  warnings?: Array<{
    type: string;
    message: string;
    product_id?: UUID;
  }>;
  errors?: string[];
}

// =============================================================================
// SYNC STATUS
// =============================================================================

/**
 * Queue statistics from offline DB
 */
export interface QueueStats {
  pending_orders: number;
  pending_operations: number;
  conflict_orders: number;
  failed_orders: number;
}

/**
 * Sync status for UI display
 */
export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  isFlushingQueue: boolean;
  pendingCount: number;
  lastSyncAt: string | null;
  lastError: string | null;
}
