/**
 * SQLite Schema for Offline POS Database
 *
 * Tables:
 * - datasets: Tracks sync versions for each dataset
 * - products, categories, modifier_sets, discounts, taxes, product_types: Cached catalog data
 * - inventory_stocks, inventory_locations: Cached inventory data
 * - settings, users: Configuration and auth data
 * - pending_operations: Queue for operations to sync
 * - offline_orders, offline_payments, offline_approvals: Offline transaction data
 * - device_meta: Terminal limits and counters
 */

/**
 * Initialize all database tables
 * @param {import('better-sqlite3').Database} db
 */
export function initializeSchema(db) {
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -10000'); // 10MB cache
  db.pragma('secure_delete = ON');

  // Dataset versioning table
  db.exec(`
    CREATE TABLE IF NOT EXISTS datasets (
      key TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      synced_at TEXT NOT NULL,
      record_count INTEGER DEFAULT 0,
      deleted_count INTEGER DEFAULT 0
    );
  `);

  // Products table
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      product_type_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      category_id TEXT,
      image TEXT,
      track_inventory INTEGER NOT NULL DEFAULT 0,
      barcode TEXT,
      has_modifiers INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_public INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      tax_ids TEXT, -- JSON array of tax IDs
      modifier_sets TEXT -- JSON array of modifier set configurations
    );
    CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, is_public);
  `);

  // Categories table
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      lft INTEGER,
      rght INTEGER,
      tree_id INTEGER,
      level INTEGER,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_public INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);
    CREATE INDEX IF NOT EXISTS idx_categories_tree ON categories(tree_id, lft, rght);
  `);

  // Modifier sets table
  db.exec(`
    CREATE TABLE IF NOT EXISTS modifier_sets (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      internal_name TEXT NOT NULL,
      selection_type TEXT NOT NULL,
      min_selections INTEGER DEFAULT 0,
      max_selections INTEGER,
      triggered_by_option_id TEXT,
      updated_at TEXT NOT NULL,
      options TEXT NOT NULL -- JSON array of modifier options
    );
  `);

  // Discounts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS discounts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      code TEXT,
      type TEXT NOT NULL,
      scope TEXT NOT NULL,
      value REAL NOT NULL,
      min_purchase_amount REAL,
      buy_quantity INTEGER,
      get_quantity INTEGER,
      start_date TEXT,
      end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      applicable_products TEXT, -- JSON array
      applicable_categories TEXT, -- JSON array
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_discounts_code ON discounts(code);
    CREATE INDEX IF NOT EXISTS idx_discounts_active ON discounts(is_active);
  `);

  // Taxes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS taxes (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      rate REAL NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Product types table
  db.exec(`
    CREATE TABLE IF NOT EXISTS product_types (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      inventory_behavior TEXT NOT NULL,
      stock_enforcement TEXT NOT NULL,
      allow_negative_stock INTEGER NOT NULL DEFAULT 0,
      tax_inclusive INTEGER NOT NULL DEFAULT 0,
      pricing_method TEXT NOT NULL,
      exclude_from_discounts INTEGER NOT NULL DEFAULT 0,
      max_quantity_per_item INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);

  // Inventory locations table
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_locations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      store_location_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      low_stock_threshold REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);

  // Inventory stocks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_stocks (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      store_location_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      expiration_date TEXT,
      low_stock_threshold REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_product ON inventory_stocks(product_id);
    CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory_stocks(location_id);
  `);

  // Settings table (key-value store for global + location settings)
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT,
      email TEXT NOT NULL,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      role TEXT NOT NULL,
      is_pos_staff INTEGER NOT NULL DEFAULT 0,
      pin TEXT, -- Hashed PIN
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role, is_pos_staff);
  `);

  // Pending operations queue
  db.exec(`
    CREATE TABLE IF NOT EXISTS pending_operations (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'ORDER', 'INVENTORY', 'APPROVAL'
      payload TEXT NOT NULL, -- JSON payload
      order_id TEXT, -- Local order ID reference
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENDING', 'SENT', 'FAILED'
      retries INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      device_signature TEXT,
      error_message TEXT,
      server_response TEXT -- JSON response from server
    );
    CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_operations(status);
    CREATE INDEX IF NOT EXISTS idx_pending_created ON pending_operations(created_at);
  `);

  // Offline orders table
  db.exec(`
    CREATE TABLE IF NOT EXISTS offline_orders (
      local_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL, -- Full order payload JSON
      status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SYNCED', 'CONFLICT'
      synced_at TEXT,
      server_order_id TEXT, -- Backend order ID after sync
      server_order_number TEXT, -- Backend order number after sync
      conflict_reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_offline_orders_status ON offline_orders(status);
  `);

  // Offline payments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS offline_payments (
      id TEXT PRIMARY KEY,
      local_order_id TEXT NOT NULL,
      method TEXT NOT NULL, -- 'CASH', 'CARD_TERMINAL', 'GIFT_CARD'
      amount REAL NOT NULL,
      tip REAL DEFAULT 0,
      surcharge REAL DEFAULT 0,
      status TEXT NOT NULL, -- 'COMPLETED', 'PENDING'
      transaction_id TEXT, -- Stripe intent ID
      provider_response TEXT, -- JSON
      cash_tendered REAL,
      change_given REAL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(local_order_id) REFERENCES offline_orders(local_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_offline_payments_order ON offline_payments(local_order_id);
  `);

  // Offline approvals table
  db.exec(`
    CREATE TABLE IF NOT EXISTS offline_approvals (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      pin TEXT NOT NULL, -- Hashed PIN
      action TEXT NOT NULL, -- 'DISCOUNT', 'VOID', 'REFUND', 'PRICE_OVERRIDE'
      reference TEXT,
      local_order_id TEXT,
      value REAL,
      notes TEXT,
      timestamp TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_approvals_synced ON offline_approvals(synced);
  `);

  // Device metadata table
  db.exec(`
    CREATE TABLE IF NOT EXISTS device_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Initialize device metadata with default values
  const initMeta = db.prepare(`
    INSERT OR IGNORE INTO device_meta (key, value, updated_at) VALUES (?, ?, datetime('now'))
  `);

  const now = new Date().toISOString();
  initMeta.run('offline_transaction_count', '0');
  initMeta.run('offline_cash_total', '0');
  initMeta.run('offline_card_total', '0');
  initMeta.run('last_sync_attempt', now);
  initMeta.run('last_sync_success', now);
  initMeta.run('network_status', 'online');
  initMeta.run('offline_since', '');
}

/**
 * Drop all tables (for testing/reset)
 * @param {import('better-sqlite3').Database} db
 */
export function dropAllTables(db) {
  const tables = [
    'datasets',
    'products',
    'categories',
    'modifier_sets',
    'discounts',
    'taxes',
    'product_types',
    'inventory_locations',
    'inventory_stocks',
    'settings',
    'users',
    'pending_operations',
    'offline_orders',
    'offline_payments',
    'offline_approvals',
    'device_meta'
  ];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
