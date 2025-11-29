/**
 * Dataset CRUD operations for offline caching
 *
 * Handles:
 * - Upserting datasets (products, categories, discounts, etc.)
 * - Querying cached data
 * - Deleting soft-deleted records
 * - Tracking dataset versions
 */

/**
 * Update dataset version tracking
 * @param {import('better-sqlite3').Database} db
 * @param {string} key - Dataset key (e.g., 'products', 'categories')
 * @param {string} version - Version token (ISO8601 timestamp)
 * @param {number} recordCount - Number of records synced
 * @param {number} deletedCount - Number of deleted records
 */
export function updateDatasetVersion(db, key, version, recordCount = 0, deletedCount = 0) {
  const stmt = db.prepare(`
    INSERT INTO datasets (key, version, synced_at, record_count, deleted_count)
    VALUES (?, ?, datetime('now'), ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      version = excluded.version,
      synced_at = excluded.synced_at,
      record_count = excluded.record_count,
      deleted_count = excluded.deleted_count
  `);

  stmt.run(key, version, recordCount, deletedCount);
}

/**
 * Get dataset version
 * @param {import('better-sqlite3').Database} db
 * @param {string} key
 * @returns {{version: string, synced_at: string} | null}
 */
export function getDatasetVersion(db, key) {
  const stmt = db.prepare('SELECT version, synced_at FROM datasets WHERE key = ?');
  return stmt.get(key);
}

/**
 * Upsert products into cache
 * @param {import('better-sqlite3').Database} db
 * @param {Array} products - Array of product objects from sync API
 */
export function upsertProducts(db, products) {
  const stmt = db.prepare(`
    INSERT INTO products (
      id, tenant_id, product_type_id, name, description, price, category_id,
      image, track_inventory, barcode, has_modifiers, is_active, is_public,
      created_at, updated_at, tax_ids, modifier_sets
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      product_type_id = excluded.product_type_id,
      name = excluded.name,
      description = excluded.description,
      price = excluded.price,
      category_id = excluded.category_id,
      image = excluded.image,
      track_inventory = excluded.track_inventory,
      barcode = excluded.barcode,
      has_modifiers = excluded.has_modifiers,
      is_active = excluded.is_active,
      is_public = excluded.is_public,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at,
      tax_ids = excluded.tax_ids,
      modifier_sets = excluded.modifier_sets
  `);

  const insertMany = db.transaction((products) => {
    for (const product of products) {
      stmt.run(
        product.id,
        product.tenant_id,
        product.product_type_id,
        product.name,
        product.description || '',
        product.price,
        product.category_id,
        product.image,
        product.track_inventory ? 1 : 0,
        product.barcode,
        product.has_modifiers ? 1 : 0,
        product.is_active ? 1 : 0,
        product.is_public ? 1 : 0,
        product.created_at,
        product.updated_at,
        JSON.stringify(product.tax_ids || []),
        JSON.stringify(product.modifier_sets || [])
      );
    }
  });

  insertMany(products);
}

/**
 * Upsert categories into cache
 */
export function upsertCategories(db, categories) {
  const stmt = db.prepare(`
    INSERT INTO categories (
      id, tenant_id, name, description, parent_id, lft, rght, tree_id, level,
      display_order, is_active, is_public, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      description = excluded.description,
      parent_id = excluded.parent_id,
      lft = excluded.lft,
      rght = excluded.rght,
      tree_id = excluded.tree_id,
      level = excluded.level,
      display_order = excluded.display_order,
      is_active = excluded.is_active,
      is_public = excluded.is_public,
      updated_at = excluded.updated_at
  `);

  const insertMany = db.transaction((categories) => {
    for (const cat of categories) {
      const displayOrder =
        cat.display_order != null ? cat.display_order
        : cat.order != null ? cat.order
        : 0;
      stmt.run(
        cat.id,
        cat.tenant_id,
        cat.name,
        cat.description || '',
        cat.parent_id,
        cat.lft,
        cat.rght,
        cat.tree_id,
        cat.level,
        displayOrder,
        cat.is_active ? 1 : 0,
        cat.is_public ? 1 : 0,
        cat.updated_at
      );
    }
  });

  insertMany(categories);
}

/**
 * Upsert modifier sets into cache
 */
export function upsertModifierSets(db, modifierSets) {
  const stmt = db.prepare(`
    INSERT INTO modifier_sets (
      id, tenant_id, name, internal_name, selection_type, min_selections,
      max_selections, triggered_by_option_id, updated_at, options
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      internal_name = excluded.internal_name,
      selection_type = excluded.selection_type,
      min_selections = excluded.min_selections,
      max_selections = excluded.max_selections,
      triggered_by_option_id = excluded.triggered_by_option_id,
      updated_at = excluded.updated_at,
      options = excluded.options
  `);

  const insertMany = db.transaction((sets) => {
    for (const set of sets) {
      stmt.run(
        set.id,
        set.tenant_id,
        set.name,
        set.internal_name,
        set.selection_type,
        set.min_selections,
        set.max_selections,
        set.triggered_by_option_id,
        set.updated_at,
        JSON.stringify(set.options || [])
      );
    }
  });

  insertMany(modifierSets);
}

/**
 * Upsert discounts into cache
 */
export function upsertDiscounts(db, discounts) {
  const stmt = db.prepare(`
    INSERT INTO discounts (
      id, tenant_id, name, code, type, scope, value, min_purchase_amount,
      buy_quantity, get_quantity, start_date, end_date, is_active,
      applicable_products, applicable_categories, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      code = excluded.code,
      type = excluded.type,
      scope = excluded.scope,
      value = excluded.value,
      min_purchase_amount = excluded.min_purchase_amount,
      buy_quantity = excluded.buy_quantity,
      get_quantity = excluded.get_quantity,
      start_date = excluded.start_date,
      end_date = excluded.end_date,
      is_active = excluded.is_active,
      applicable_products = excluded.applicable_products,
      applicable_categories = excluded.applicable_categories,
      updated_at = excluded.updated_at
  `);

  const insertMany = db.transaction((discounts) => {
    for (const disc of discounts) {
      stmt.run(
        disc.id,
        disc.tenant_id,
        disc.name,
        disc.code,
        disc.type,
        disc.scope,
        disc.value,
        disc.min_purchase_amount,
        disc.buy_quantity,
        disc.get_quantity,
        disc.start_date,
        disc.end_date,
        disc.is_active ? 1 : 0,
        JSON.stringify(disc.applicable_product_ids || []),
        JSON.stringify(disc.applicable_category_ids || []),
        disc.updated_at
      );
    }
  });

  insertMany(discounts);
}

/**
 * Upsert taxes into cache
 */
export function upsertTaxes(db, taxes) {
  const stmt = db.prepare(`
    INSERT INTO taxes (id, tenant_id, name, rate, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      rate = excluded.rate,
      updated_at = excluded.updated_at
  `);

  const insertMany = db.transaction((taxes) => {
    for (const tax of taxes) {
      stmt.run(tax.id, tax.tenant_id, tax.name, tax.rate, tax.updated_at);
    }
  });

  insertMany(taxes);
}

/**
 * Upsert product types into cache
 */
export function upsertProductTypes(db, productTypes) {
  const stmt = db.prepare(`
    INSERT INTO product_types (
      id, tenant_id, name, description, inventory_behavior, stock_enforcement,
      allow_negative_stock, tax_inclusive, pricing_method, exclude_from_discounts,
      max_quantity_per_item, is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      name = excluded.name,
      description = excluded.description,
      inventory_behavior = excluded.inventory_behavior,
      stock_enforcement = excluded.stock_enforcement,
      allow_negative_stock = excluded.allow_negative_stock,
      tax_inclusive = excluded.tax_inclusive,
      pricing_method = excluded.pricing_method,
      exclude_from_discounts = excluded.exclude_from_discounts,
      max_quantity_per_item = excluded.max_quantity_per_item,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);

  const insertMany = db.transaction((types) => {
    for (const type of types) {
      stmt.run(
        type.id,
        type.tenant_id,
        type.name,
        type.description || '',
        type.inventory_behavior,
        type.stock_enforcement,
        type.allow_negative_stock ? 1 : 0,
        type.tax_inclusive ? 1 : 0,
        type.pricing_method,
        type.exclude_from_discounts ? 1 : 0,
        type.max_quantity_per_item,
        type.is_active ? 1 : 0,
        type.updated_at
      );
    }
  });

  insertMany(productTypes);
}

/**
 * Upsert inventory stocks into cache
 */
export function upsertInventoryStocks(db, stocks) {
  const stmt = db.prepare(`
    INSERT INTO inventory_stocks (
      id, tenant_id, store_location_id, product_id, location_id, quantity,
      expiration_date, low_stock_threshold, is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      store_location_id = excluded.store_location_id,
      product_id = excluded.product_id,
      location_id = excluded.location_id,
      quantity = excluded.quantity,
      expiration_date = excluded.expiration_date,
      low_stock_threshold = excluded.low_stock_threshold,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);

  const insertMany = db.transaction((stocks) => {
    for (const stock of stocks) {
      stmt.run(
        stock.id,
        stock.tenant_id,
        stock.store_location_id,
        stock.product_id,
        stock.location_id,
        stock.quantity,
        stock.expiration_date,
        stock.low_stock_threshold,
        stock.is_active ? 1 : 0,
        stock.updated_at
      );
    }
  });

  insertMany(stocks);
}

/**
 * Upsert inventory locations into cache
 */
export function upsertInventoryLocations(db, locations) {
  const stmt = db.prepare(`
    INSERT INTO inventory_locations (
      id, tenant_id, store_location_id, name, description, low_stock_threshold,
      is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      store_location_id = excluded.store_location_id,
      name = excluded.name,
      description = excluded.description,
      low_stock_threshold = excluded.low_stock_threshold,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);

  const insertMany = db.transaction((locations) => {
    for (const loc of locations) {
      stmt.run(
        loc.id,
        loc.tenant_id,
        loc.store_location_id,
        loc.name,
        loc.description || '',
        loc.low_stock_threshold,
        loc.is_active ? 1 : 0,
        loc.updated_at
      );
    }
  });

  insertMany(locations);
}

/**
 * Upsert settings into cache
 *
 * Settings data can include:
 * - global_settings: Tenant-wide settings (brand, currency, surcharge, etc.)
 * - store_location: Location-specific settings (address, tax rate, receipts, etc.)
 * - printers: Network printers configured for this location
 * - kitchen_zones: Kitchen zones with category routing for this location
 * - terminal: This terminal's registration settings (offline limits, reader, etc.)
 */
export function upsertSettings(db, settingsData) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);

  // Store global settings
  if (settingsData.global_settings) {
    stmt.run('global_settings', JSON.stringify(settingsData.global_settings));
  }

  // Store store location settings
  if (settingsData.store_location) {
    stmt.run('store_location', JSON.stringify(settingsData.store_location));
  }

  // Store printers (only if array has items - avoid overwriting on incremental sync)
  if (settingsData.printers && settingsData.printers.length > 0) {
    stmt.run('printers', JSON.stringify(settingsData.printers));
  }

  // Store kitchen zones (only if array has items - avoid overwriting on incremental sync)
  if (settingsData.kitchen_zones && settingsData.kitchen_zones.length > 0) {
    stmt.run('kitchen_zones', JSON.stringify(settingsData.kitchen_zones));
  }

  // Store terminal registration
  if (settingsData.terminal) {
    stmt.run('terminal', JSON.stringify(settingsData.terminal));
  }
}

/**
 * Upsert users into cache
 */
export function upsertUsers(db, users) {
  const stmt = db.prepare(`
    INSERT INTO users (
      id, tenant_id, email, username, first_name, last_name, role,
      is_pos_staff, pin, is_active, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      tenant_id = excluded.tenant_id,
      email = excluded.email,
      username = excluded.username,
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      role = excluded.role,
      is_pos_staff = excluded.is_pos_staff,
      pin = excluded.pin,
      is_active = excluded.is_active,
      updated_at = excluded.updated_at
  `);

  const insertMany = db.transaction((users) => {
    for (const user of users) {
      stmt.run(
        user.id,
        user.tenant_id,
        user.email,
        user.username,
        user.first_name,
        user.last_name,
        user.role,
        user.is_pos_staff ? 1 : 0,
        user.pin,
        user.is_active ? 1 : 0,
        user.updated_at
      );
    }
  });

  insertMany(users);
}

/**
 * Delete records by ID (soft delete handling)
 * @param {import('better-sqlite3').Database} db
 * @param {string} tableName
 * @param {Array<string>} deletedIds
 */
export function deleteRecords(db, tableName, deletedIds) {
  if (!deletedIds || deletedIds.length === 0) return;

  const placeholders = deletedIds.map(() => '?').join(',');
  const stmt = db.prepare(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`);
  stmt.run(...deletedIds);
}

/**
 * Get all products with optional filters
 * @param {object} db - Database instance
 * @param {object} filters - Optional filters
 * @param {string} filters.search - Search term (matches name or barcode)
 * @param {string} filters.category - Category ID to filter by
 * @param {boolean} filters.includeArchived - Include archived products
 */
export function getProducts(db, filters = {}) {
  let query = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  // Filter by active status
  if (!filters.includeArchived) {
    query += ' AND is_active = 1';
  } else if (filters.includeArchived === 'only') {
    query += ' AND is_active = 0';
  }

  // Search filter (name or barcode)
  if (filters.search) {
    query += ' AND (name LIKE ? OR barcode LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`);
  }

  // Category filter
  if (filters.category) {
    query += ' AND category_id = ?';
    params.push(filters.category);
  }

  const stmt = db.prepare(query);
  const products = stmt.all(...params);

  // Parse JSON fields
  return products.map(p => ({
    ...p,
    track_inventory: p.track_inventory === 1,
    has_modifiers: p.has_modifiers === 1,
    is_active: p.is_active === 1,
    is_public: p.is_public === 1,
    tax_ids: JSON.parse(p.tax_ids || '[]'),
    modifier_sets: JSON.parse(p.modifier_sets || '[]')
  }));
}

/**
 * Get product by ID
 */
export function getProductById(db, id) {
  const stmt = db.prepare('SELECT * FROM products WHERE id = ?');
  const product = stmt.get(id);

  if (!product) return null;

  return {
    ...product,
    track_inventory: product.track_inventory === 1,
    has_modifiers: product.has_modifiers === 1,
    is_active: product.is_active === 1,
    is_public: product.is_public === 1,
    tax_ids: JSON.parse(product.tax_ids || '[]'),
    modifier_sets: JSON.parse(product.modifier_sets || '[]')
  };
}

/**
 * Get product by barcode
 */
export function getProductByBarcode(db, barcode) {
  const stmt = db.prepare('SELECT * FROM products WHERE barcode = ? AND is_active = 1');
  const product = stmt.get(barcode);

  if (!product) return null;

  return {
    ...product,
    track_inventory: product.track_inventory === 1,
    has_modifiers: product.has_modifiers === 1,
    is_active: product.is_active === 1,
    is_public: product.is_public === 1,
    tax_ids: JSON.parse(product.tax_ids || '[]'),
    modifier_sets: JSON.parse(product.modifier_sets || '[]')
  };
}

/**
 * Get all categories
 */
export function getCategories(db) {
  const stmt = db.prepare('SELECT * FROM categories WHERE is_active = 1 ORDER BY display_order, name');
  const categories = stmt.all();

  // Build a map of categories by ID for parent lookup
  const categoryMap = new Map();
  const normalized = categories.map(c => ({
    ...c,
    order: c.display_order, // Normalize: SQLite uses display_order, API uses order
    is_active: c.is_active === 1,
    is_public: c.is_public === 1
  }));

  normalized.forEach(cat => categoryMap.set(cat.id, cat));

  // Hydrate parent relationships
  return normalized.map(cat => {
    if (cat.parent_id) {
      const parent = categoryMap.get(cat.parent_id);
      if (parent) {
        return {
          ...cat,
          parent: {
            id: parent.id,
            name: parent.name,
          }
        };
      }
    }
    return cat;
  });
}

/**
 * Get all discounts
 * @param {Object} options
 * @param {string} options.includeArchived - 'only' for archived only, true for all, false for active only (default)
 */
export function getDiscounts(db, options = {}) {
  const { includeArchived = false } = options;

  let query = 'SELECT * FROM discounts';
  if (includeArchived === 'only') {
    query += ' WHERE is_active = 0';
  } else if (!includeArchived) {
    query += ' WHERE is_active = 1';
  }

  const stmt = db.prepare(query);
  const discounts = stmt.all();

  return discounts.map(d => ({
    ...d,
    is_active: d.is_active === 1,
    applicable_products: JSON.parse(d.applicable_products || '[]'),
    applicable_categories: JSON.parse(d.applicable_categories || '[]')
  }));
}

/**
 * Get all modifier sets
 */
export function getModifierSets(db) {
  const stmt = db.prepare('SELECT * FROM modifier_sets');
  const sets = stmt.all();

  return sets.map(s => ({
    ...s,
    options: JSON.parse(s.options || '[]')
  }));
}

/**
 * Get all taxes
 */
export function getTaxes(db) {
  const stmt = db.prepare('SELECT * FROM taxes');
  return stmt.all();
}

/**
 * Get all product types
 */
export function getProductTypes(db) {
  const stmt = db.prepare('SELECT * FROM product_types WHERE is_active = 1');
  const types = stmt.all();

  return types.map(t => ({
    ...t,
    allow_negative_stock: t.allow_negative_stock === 1,
    tax_inclusive: t.tax_inclusive === 1,
    exclude_from_discounts: t.exclude_from_discounts === 1,
    is_active: t.is_active === 1
  }));
}

/**
 * Get inventory stock with hydrated product and location data
 */
export function getInventoryStocks(db) {
  const stmt = db.prepare('SELECT * FROM inventory_stocks WHERE is_active = 1');
  const stocks = stmt.all();

  // Get products and locations for hydration
  const products = getProducts(db);
  const productMap = new Map(products.map(p => [p.id, p]));

  const locations = getInventoryLocations(db);
  const locationMap = new Map(locations.map(l => [l.id, l]));

  return stocks.map(s => {
    const product = productMap.get(s.product_id);
    const location = locationMap.get(s.location_id);

    return {
      ...s,
      is_active: s.is_active === 1,
      // Hydrate with nested product object (matching API structure)
      product: product ? {
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        price: product.price,
      } : { id: s.product_id, name: 'Unknown Product' },
      // Hydrate with nested location object
      location: location ? {
        id: location.id,
        name: location.name,
      } : { id: s.location_id, name: 'Unknown Location' },
    };
  });
}

/**
 * Get inventory stock by product ID
 */
export function getInventoryByProductId(db, productId) {
  const stmt = db.prepare('SELECT * FROM inventory_stocks WHERE product_id = ? AND is_active = 1');
  const stock = stmt.get(productId);

  if (!stock) return null;

  return {
    ...stock,
    is_active: stock.is_active === 1
  };
}

/**
 * Get inventory locations
 */
export function getInventoryLocations(db) {
  const stmt = db.prepare('SELECT * FROM inventory_locations WHERE is_active = 1 ORDER BY name');
  const locations = stmt.all();

  return locations.map(loc => ({
    ...loc,
    is_active: loc.is_active === 1
  }));
}

/**
 * Get settings
 */
export function getSettings(db) {
  const stmt = db.prepare('SELECT * FROM settings');
  const rows = stmt.all();

  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }

  return settings;
}

/**
 * Get all users (POS staff)
 * @param {import('better-sqlite3').Database} db
 * @param {Object} options
 * @param {boolean|string} options.includeArchived - false (active only), 'only' (archived only), true (all)
 */
export function getUsers(db, options = {}) {
  const { includeArchived = false } = options;

  let query = 'SELECT * FROM users WHERE is_pos_staff = 1';

  // Filter by active status based on includeArchived
  if (includeArchived === 'only') {
    query += ' AND is_active = 0';
  } else if (!includeArchived) {
    query += ' AND is_active = 1';
  }
  // If includeArchived === true, show all (no additional filter)

  const stmt = db.prepare(query);
  const users = stmt.all();

  return users.map(u => ({
    ...u,
    is_pos_staff: u.is_pos_staff === 1,
    is_active: u.is_active === 1
  }));
}

/**
 * Get user by ID
 */
export function getUserById(db, id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  const user = stmt.get(id);

  if (!user) return null;

  return {
    ...user,
    is_pos_staff: user.is_pos_staff === 1,
    is_active: user.is_active === 1
  };
}
