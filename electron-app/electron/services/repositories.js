import { databaseService } from "./database-service.js";

/**
 * Base Repository class with common operations
 */
class BaseRepository {
	constructor(tableName) {
		this.tableName = tableName;
	}

	get db() {
		return databaseService.getDatabase();
	}

	/**
	 * Sanitize data for SQLite compatibility
	 */
	sanitizeRecord(record) {
		const sanitized = {};

		for (const [key, value] of Object.entries(record)) {
			if (value === null || value === undefined) {
				sanitized[key] = null;
			} else if (typeof value === "boolean") {
				// Convert boolean to integer for SQLite
				sanitized[key] = value ? 1 : 0;
			} else if (typeof value === "object" && value !== null) {
				// Convert objects to JSON strings or handle specific cases
				if (value instanceof Date) {
					sanitized[key] = value.toISOString();
				} else if (Array.isArray(value)) {
					sanitized[key] = JSON.stringify(value);
				} else {
					// For other objects, stringify them
					sanitized[key] = JSON.stringify(value);
				}
			} else if (
				typeof value === "string" ||
				typeof value === "number" ||
				typeof value === "bigint"
			) {
				// These types are directly supported by SQLite
				sanitized[key] = value;
			} else {
				// For any other type, convert to string
				sanitized[key] = String(value);
			}
		}

		return sanitized;
	}

	/**
	 * Get all records
	 */
	getAll() {
		const stmt = this.db.prepare(
			`SELECT * FROM ${this.tableName} WHERE is_active = 1`
		);
		return stmt.all();
	}

	/**
	 * Get record by ID
	 */
	getById(id) {
		const stmt = this.db.prepare(
			`SELECT * FROM ${this.tableName} WHERE id = ?`
		);
		return stmt.get(id);
	}

	/**
	 * Delete all records and insert new ones (for full sync)
	 */
	replaceAll(records) {
		const transaction = this.db.transaction(() => {
			// Clear existing data
			this.db.prepare(`DELETE FROM ${this.tableName}`).run();

			// Insert new data
			if (records && records.length > 0) {
				this.insertMany(records);
			}
		});

		transaction();
	}

	/**
	 * Insert multiple records
	 */
	insertMany(records) {
		if (!records || records.length === 0) return;

		// Sanitize all records first
		const sanitizedRecords = records.map((record) =>
			this.sanitizeRecord(record)
		);

		const columns = Object.keys(sanitizedRecords[0]);
		const placeholders = columns.map(() => "?").join(", ");
		const sql = `INSERT OR REPLACE INTO ${this.tableName} (${columns.join(
			", "
		)}) VALUES (${placeholders})`;

		const stmt = this.db.prepare(sql);
		const insertMany = this.db.transaction((records) => {
			for (const record of records) {
				const values = columns.map((col) => record[col]);
				stmt.run(...values);
			}
		});

		insertMany(sanitizedRecords);
	}

	/**
	 * Update records based on backend timestamp (for delta sync)
	 */
	updateFromBackend(records) {
		if (!records || records.length === 0) return;

		const transaction = this.db.transaction(() => {
			for (const record of records) {
				// Check if record exists
				const existing = this.getById(record.id);

				if (existing) {
					// Update existing record
					this.updateRecord(record);
				} else {
					// Insert new record
					this.insertRecord(record);
				}
			}
		});

		transaction();
	}

	/**
	 * Insert a single record
	 */
	insertRecord(record) {
		const sanitizedRecord = this.sanitizeRecord(record);
		const columns = Object.keys(sanitizedRecord);
		const placeholders = columns.map(() => "?").join(", ");
		const sql = `INSERT OR REPLACE INTO ${this.tableName} (${columns.join(
			", "
		)}) VALUES (${placeholders})`;

		const stmt = this.db.prepare(sql);
		const values = columns.map((col) => sanitizedRecord[col]);
		return stmt.run(...values);
	}

	/**
	 * Update a single record
	 */
	updateRecord(record) {
		const sanitizedRecord = this.sanitizeRecord(record);
		const columns = Object.keys(sanitizedRecord).filter((col) => col !== "id");
		const setClause = columns.map((col) => `${col} = ?`).join(", ");
		const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;

		const stmt = this.db.prepare(sql);
		const values = columns.map((col) => sanitizedRecord[col]);
		values.push(sanitizedRecord.id);
		return stmt.run(...values);
	}
}

/**
 * Products Repository
 */
export class ProductRepository extends BaseRepository {
	constructor() {
		super("products");
	}

	/**
	 * Get all products with category information
	 */
	getAll() {
		const stmt = this.db.prepare(`
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.description as category_description,
                c.parent_id as category_parent_id,
                parent_c.id as parent_category_id,
                parent_c.name as parent_category_name
            FROM ${this.tableName} p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent_c ON c.parent_id = parent_c.id
            WHERE p.is_active = 1
        `);

		const rows = stmt.all();

		// Transform the flat results into products with nested category objects
		return rows.map((row) => {
			const product = {
				id: row.id,
				name: row.name,
				description: row.description,
				price: row.price,
				product_type_id: row.product_type_id,
				image_url: row.image_url,
				local_image_path: row.local_image_path,
				is_active: row.is_active,
				created_at: row.created_at,
				updated_at: row.updated_at,
				backend_updated_at: row.backend_updated_at,
				category: null,
			};

			// Add category information if it exists
			if (row.category_id) {
				product.category = {
					id: row.category_id,
					name: row.category_name,
					description: row.category_description,
					parent_id: row.category_parent_id,
					parent: row.parent_category_id
						? {
								id: row.parent_category_id,
								name: row.parent_category_name,
						  }
						: null,
				};
			}

			return product;
		});
	}

	/**
	 * Get record by ID with category information
	 */
	getById(id) {
		const stmt = this.db.prepare(`
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.description as category_description,
                c.parent_id as category_parent_id,
                parent_c.id as parent_category_id,
                parent_c.name as parent_category_name
            FROM ${this.tableName} p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent_c ON c.parent_id = parent_c.id
            WHERE p.id = ?
        `);

		const row = stmt.get(id);
		if (!row) return null;

		const product = {
			id: row.id,
			name: row.name,
			description: row.description,
			price: row.price,
			product_type_id: row.product_type_id,
			image_url: row.image_url,
			local_image_path: row.local_image_path,
			is_active: row.is_active,
			created_at: row.created_at,
			updated_at: row.updated_at,
			backend_updated_at: row.backend_updated_at,
			category: null,
		};

		// Add category information if it exists
		if (row.category_id) {
			product.category = {
				id: row.category_id,
				name: row.category_name,
				description: row.category_description,
				parent_id: row.category_parent_id,
				parent: row.parent_category_id
					? {
							id: row.parent_category_id,
							name: row.parent_category_name,
					  }
					: null,
			};
		}

		return product;
	}

	/**
	 * Get products by category
	 */
	getByCategory(categoryId) {
		const stmt = this.db.prepare(`
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.description as category_description,
                c.parent_id as category_parent_id,
                parent_c.id as parent_category_id,
                parent_c.name as parent_category_name
            FROM ${this.tableName} p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent_c ON c.parent_id = parent_c.id
            WHERE p.category_id = ? AND p.is_active = 1
        `);

		const rows = stmt.all(categoryId);

		// Transform the flat results into products with nested category objects
		return rows.map((row) => {
			const product = {
				id: row.id,
				name: row.name,
				description: row.description,
				price: row.price,
				product_type_id: row.product_type_id,
				image_url: row.image_url,
				local_image_path: row.local_image_path,
				is_active: row.is_active,
				created_at: row.created_at,
				updated_at: row.updated_at,
				backend_updated_at: row.backend_updated_at,
				category: null,
			};

			// Add category information if it exists
			if (row.category_id) {
				product.category = {
					id: row.category_id,
					name: row.category_name,
					description: row.category_description,
					parent_id: row.category_parent_id,
					parent: row.parent_category_id
						? {
								id: row.parent_category_id,
								name: row.parent_category_name,
						  }
						: null,
				};
			}

			return product;
		});
	}

	/**
	 * Search products by name
	 */
	searchByName(searchTerm) {
		const stmt = this.db.prepare(`
            SELECT 
                p.*,
                c.id as category_id,
                c.name as category_name,
                c.description as category_description,
                c.parent_id as category_parent_id,
                parent_c.id as parent_category_id,
                parent_c.name as parent_category_name
            FROM ${this.tableName} p
            LEFT JOIN categories c ON p.category_id = c.id
            LEFT JOIN categories parent_c ON c.parent_id = parent_c.id
            WHERE p.name LIKE ? AND p.is_active = 1
        `);

		const rows = stmt.all(`%${searchTerm}%`);

		// Transform the flat results into products with nested category objects
		return rows.map((row) => {
			const product = {
				id: row.id,
				name: row.name,
				description: row.description,
				price: row.price,
				product_type_id: row.product_type_id,
				image_url: row.image_url,
				local_image_path: row.local_image_path,
				is_active: row.is_active,
				created_at: row.created_at,
				updated_at: row.updated_at,
				backend_updated_at: row.backend_updated_at,
				category: null,
			};

			// Add category information if it exists
			if (row.category_id) {
				product.category = {
					id: row.category_id,
					name: row.category_name,
					description: row.category_description,
					parent_id: row.category_parent_id,
					parent: row.parent_category_id
						? {
								id: row.parent_category_id,
								name: row.parent_category_name,
						  }
						: null,
				};
			}

			return product;
		});
	}

	/**
	 * Get products with local images
	 */
	getProductsWithLocalImages() {
		const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE local_image_path IS NOT NULL AND is_active = 1
        `);
		return stmt.all();
	}

	/**
	 * Update local image path for a product
	 */
	updateLocalImagePath(productId, localPath) {
		const stmt = this.db.prepare(`
            UPDATE ${this.tableName} 
            SET local_image_path = ? 
            WHERE id = ?
        `);
		return stmt.run(localPath, productId);
	}
}

/**
 * Categories Repository
 */
export class CategoryRepository extends BaseRepository {
	constructor() {
		super("categories");
	}

	/**
	 * Override replaceAll to handle hierarchical data properly
	 * Categories have parent-child relationships that need special handling
	 */
	replaceAll(records) {
		if (!records || records.length === 0) {
			const transaction = this.db.transaction(() => {
				// Manually delete products first to resolve foreign key constraint
				this.db.prepare(`DELETE FROM products`).run();
				this.db.prepare(`DELETE FROM ${this.tableName}`).run();
			});
			transaction();
			return;
		}

		const transaction = this.db.transaction(() => {
			// --- THE FIX ---
			// Manually delete products first to resolve the foreign key constraint
			// before we delete the categories.
			this.db.prepare(`DELETE FROM products`).run();

			// Clear existing category data
			this.db.prepare(`DELETE FROM ${this.tableName}`).run();

			// Insert records in proper hierarchical order
			this.insertCategoriesHierarchically(records);
		});

		transaction();
	}

	/**
	 * Insert categories in the correct order to respect foreign key constraints.
	 * This iterative method is robust against unordered data, orphans, and circular dependencies.
	 */
	insertCategoriesHierarchically(categories) {
		const categoryMap = new Map(categories.map((c) => [c.id, c]));
		const recordsToInsert = [...categories];
		const insertedIds = new Set();
		let lastRoundCount = -1;

		while (
			recordsToInsert.length > 0 &&
			recordsToInsert.length !== lastRoundCount
		) {
			lastRoundCount = recordsToInsert.length;
			const remainingRecords = [];

			for (const record of recordsToInsert) {
				if (!record.parent_id || insertedIds.has(record.parent_id)) {
					try {
						this.insertRecord(record);
						insertedIds.add(record.id);
					} catch (e) {
						console.error(
							`Error inserting category ${record.name}: ${e.message}`
						);
					}
				} else {
					if (categoryMap.has(record.parent_id)) {
						remainingRecords.push(record);
					} else {
						console.error(
							`Skipping orphan category "${record.name}" (ID: ${record.id}). Parent ID ${record.parent_id} not found in sync payload.`
						);
					}
				}
			}
			recordsToInsert.splice(0, recordsToInsert.length, ...remainingRecords);
		}

		if (recordsToInsert.length > 0) {
			console.error(
				"Could not insert the following categories due to circular dependencies or missing parents:",
				recordsToInsert.map((r) => r.name)
			);
		}
	}

	/**
	 * Get categories with product count
	 */
	getCategoriesWithProductCount() {
		const stmt = this.db.prepare(`
            SELECT c.*, COUNT(p.id) as product_count
            FROM categories c
            LEFT JOIN products p ON c.id = p.category_id AND p.is_active = 1
            WHERE c.is_active = 1
            GROUP BY c.id
        `);
		return stmt.all();
	}
}
/**
 * Users Repository
 */
export class UserRepository extends BaseRepository {
	constructor() {
		super("users");
	}

	/**
	 * Get user by username
	 */
	getByUsername(username) {
		const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE username = ? AND is_active = 1
        `);
		return stmt.get(username);
	}

	/**
	 * Get users by role
	 */
	getByRole(role) {
		const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE role = ? AND is_active = 1
        `);
		return stmt.all(role);
	}
}

/**
 * Discounts Repository
 */
export class DiscountRepository extends BaseRepository {
	constructor() {
		super("discounts");
	}

	/**
	 * Get discounts by type
	 */
	getByType(type) {
		const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE type = ? AND is_active = 1
        `);
		return stmt.all(type);
	}

	/**
	 * Get active discounts
	 */
	getActiveDiscounts() {
		return this.getAll(); // BaseRepository already filters by is_active = 1
	}
}

/**
 * Offline Orders Repository
 */
export class OfflineOrderRepository {
	constructor() {
		this.tableName = "offline_orders";
	}

	get db() {
		return databaseService.getDatabase();
	}

	/**
	 * Add order to offline queue
	 */
	addToQueue(orderData) {
		const stmt = this.db.prepare(`
            INSERT INTO ${this.tableName} (order_data, status, created_at) 
            VALUES (?, 'PENDING_SYNC', CURRENT_TIMESTAMP)
        `);
		return stmt.run(JSON.stringify(orderData));
	}

	/**
	 * Get all pending orders
	 */
	getPendingOrders() {
		const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE status = 'PENDING_SYNC' 
            ORDER BY created_at ASC
        `);
		return stmt.all().map((row) => ({
			...row,
			order_data: JSON.parse(row.order_data),
		}));
	}

	/**
	 * Mark order as synced
	 */
	markAsSynced(id) {
		const stmt = this.db.prepare(`
            UPDATE ${this.tableName} 
            SET status = 'SYNCED', last_attempt_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
		return stmt.run(id);
	}

	/**
	 * Mark order as failed
	 */
	markAsFailed(id, errorMessage) {
		const stmt = this.db.prepare(`
            UPDATE ${this.tableName} 
            SET status = 'FAILED', 
                error_message = ?, 
                retry_count = retry_count + 1, 
                last_attempt_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `);
		return stmt.run(errorMessage, id);
	}

	/**
	 * Get orders that failed but can still be retried
	 */
	getRetryableFailedOrders(maxRetries = 3) {
		const stmt = this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE status = 'FAILED' AND retry_count < ?
            ORDER BY created_at ASC
        `);
		return stmt.all(maxRetries).map((row) => ({
			...row,
			order_data: JSON.parse(row.order_data),
		}));
	}

	/**
	 * Clean up old synced orders
	 */
	cleanupOldOrders(daysOld = 7) {
		const stmt = this.db.prepare(`
            DELETE FROM ${this.tableName} 
            WHERE status = 'SYNCED' 
            AND created_at < datetime('now', '-${daysOld} days')
        `);
		return stmt.run();
	}

	/**
	 * Get queue status summary
	 */
	getQueueStatus() {
		const stmt = this.db.prepare(`
            SELECT 
                status, 
                COUNT(*) as count 
            FROM ${this.tableName} 
            GROUP BY status
        `);
		return stmt.all();
	}
}

// Export repository instances
export const productRepository = new ProductRepository();
export const categoryRepository = new CategoryRepository();
export const userRepository = new UserRepository();
export const discountRepository = new DiscountRepository();
export const offlineOrderRepository = new OfflineOrderRepository();
