"""
Django management command to migrate data from legacy schema to new POS system.

Usage:
    python manage.py migrate_legacy_data --all
    python manage.py migrate_legacy_data --step users
    python manage.py migrate_legacy_data --step products
    python manage.py migrate_legacy_data --step orders
    python manage.py migrate_legacy_data --step payments
    python manage.py migrate_legacy_data --dry-run --step users
"""

import uuid
from decimal import Decimal
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction, connection
from django.utils import timezone
from django.contrib.auth.hashers import make_password
from django.db.models.signals import (
    pre_save,
    post_save,
    pre_delete,
    post_delete,
    m2m_changed,
)

from users.models import User
from products.models import Product, Category, ProductType
from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from discounts.models import Discount
from inventory.models import Location, InventoryStock


class Command(BaseCommand):
    help = "Migrate data from legacy schema to new POS system"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # This dictionary will store the original signal receivers
        self.signal_receivers_backup = {}
        # Store products that need image processing after migration
        self.products_needing_image_processing = []

    def add_arguments(self, parser):
        parser.add_argument(
            "--step",
            type=str,
            choices=[
                "users",
                "categories",
                "products",
                "orders",
                "payments",
                "all",
                "validate",
                "cleanup",
            ],
            help="Which migration step to run",
        )
        parser.add_argument(
            "--all", action="store_true", help="Run all migration steps in order"
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be migrated without making changes",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=1000,
            help="Number of records to process at once",
        )

    def handle(self, *args, **options):
        self.dry_run = options["dry_run"]
        self.batch_size = options["batch_size"]

        if options["dry_run"]:
            self.stdout.write(
                self.style.WARNING("DRY RUN MODE - No changes will be made")
            )

        # Wrap the entire command in signal disconnection/reconnection
        try:
            self.disconnect_all_signals()

            if options["all"]:
                self.run_all_migrations()
            elif options["step"]:
                self.run_migration_step(options["step"])
            else:
                raise CommandError("You must specify either --all or --step")

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Migration failed: {str(e)}"))
            # Re-raise the exception after logging and cleanup
            raise
        finally:
            # This will run even if the command fails, ensuring signals are restored
            self.reconnect_all_signals()

    def disconnect_all_signals(self):
        """
        Temporarily disconnects all receivers for major signals.
        """
        self.stdout.write(
            self.style.WARNING(
                "Disconnecting all model signals to prevent side effects..."
            )
        )

        signals_to_disable = [pre_save, post_save, pre_delete, post_delete, m2m_changed]

        for signal in signals_to_disable:
            # Store a copy of the original receivers for this signal
            self.signal_receivers_backup[signal] = signal.receivers
            # Clear the signal's list of receivers
            signal.receivers = []

        self.stdout.write(self.style.SUCCESS("✓ Signals disconnected successfully."))

    def reconnect_all_signals(self):
        """
        Restores all signal receivers from the backup.
        """
        if not self.signal_receivers_backup:
            return

        self.stdout.write(self.style.WARNING("Reconnecting all model signals..."))

        for signal, receivers in self.signal_receivers_backup.items():
            # Restore the original list of receivers
            signal.receivers = receivers

        self.stdout.write(self.style.SUCCESS("✓ Signals reconnected successfully."))
        # Clear the backup
        self.signal_receivers_backup = {}
        
        # Process images for products that need it (now that signals are reconnected)
        if hasattr(self, 'products_needing_image_processing') and self.products_needing_image_processing:
            self.process_migrated_product_images()

    def run_all_migrations(self):
        """Run all migration steps in correct order"""
        steps = ["users", "categories", "products", "orders", "payments"]

        for step in steps:
            self.stdout.write(f"\n--- Starting {step} migration ---")
            self.run_migration_step(step)
            self.stdout.write(self.style.SUCCESS(f"✓ {step} migration completed"))

        self.stdout.write(f"\n--- Running validation ---")
        self.validate_migration()

        self.stdout.write(f"\n--- Running cleanup ---")
        # Use the updated cleanup logic from our previous conversation
        self.cleanup_post_migration()

    def run_migration_step(self, step):
        """Run a specific migration step"""
        if step == "users":
            self.migrate_users()
        elif step == "categories":
            self.migrate_categories()
        elif step == "products":
            self.migrate_products()
        elif step == "orders":
            self.migrate_orders()
        elif step == "payments":
            self.migrate_payments()
        elif step == "validate":
            self.validate_migration()
        elif step == "cleanup":
            self.cleanup_post_migration()
        else:
            raise CommandError(f"Unknown migration step: {step}")

    def get_legacy_data(self, query):
        """Execute query against legacy schema"""
        with connection.cursor() as cursor:
            cursor.execute(query)
            columns = [col[0] for col in cursor.description]
            return [dict(zip(columns, row)) for row in cursor.fetchall()]

    def count_legacy_records(self, table):
        """Count records in legacy table"""
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COUNT(*) FROM legacy.{table}")
            return cursor.fetchone()[0]

    def migrate_users(self):
        """Migrate users from legacy.users_customuser"""
        legacy_count = self.count_legacy_records("users_customuser")
        current_count = User.objects.filter(legacy_id__isnull=False).count()

        self.stdout.write(f"Legacy users: {legacy_count}")
        self.stdout.write(f"Already migrated: {current_count}")

        if self.dry_run:
            return

        query = """
        SELECT id, email, username, first_name, last_name, phone_number,
               role, is_staff, is_active, date_joined, password, last_login,
               is_superuser, is_pos_user, is_website_user
        FROM legacy.users_customuser 
        WHERE id NOT IN (
            SELECT legacy_id FROM users_user WHERE legacy_id IS NOT NULL
        )
        """

        legacy_users = self.get_legacy_data(query)

        # Check for users with empty emails first
        empty_email_query = """
        SELECT COUNT(*) FROM legacy.users_customuser 
        WHERE (email IS NULL OR email = '') 
        AND id NOT IN (SELECT legacy_id FROM users_user WHERE legacy_id IS NOT NULL)
        """
        empty_email_count = self.get_legacy_data(empty_email_query)[0]["count"]
        if empty_email_count > 0:
            self.stdout.write(
                self.style.WARNING(
                    f"Creating temporary emails for {empty_email_count} users with empty emails"
                )
            )

        with transaction.atomic():
            users_to_create = []

            for user_data in legacy_users:
                # Handle users with empty emails by creating temporary ones
                email = user_data["email"]
                if not email or email.strip() == "":
                    email = f"temp_user_{user_data['id']}@ajeen.temp"
                    self.stdout.write(
                        self.style.WARNING(
                            f"Creating temporary email for user ID {user_data['id']}: {email}"
                        )
                    )
                # Map legacy role to new role enum
                role_mapping = {
                    "owner": User.Role.OWNER,
                    "admin": User.Role.ADMIN,
                    "manager": User.Role.MANAGER,
                    "cashier": User.Role.CASHIER,
                    "customer": User.Role.CUSTOMER,
                }

                role = role_mapping.get(user_data["role"], User.Role.CUSTOMER)

                user = User(
                    email=email,
                    username=user_data["username"],
                    first_name=user_data["first_name"] or "",
                    last_name=user_data["last_name"] or "",
                    phone_number=user_data["phone_number"],
                    role=role,
                    is_pos_staff=user_data["is_pos_user"],
                    is_staff=user_data["is_staff"],
                    is_active=user_data["is_active"],
                    date_joined=user_data["date_joined"],
                    password=user_data["password"],
                    last_login=user_data["last_login"],
                    is_superuser=user_data["is_superuser"],
                    legacy_id=user_data["id"],
                )
                users_to_create.append(user)

            User.objects.bulk_create(users_to_create, batch_size=self.batch_size)
            self.stdout.write(f"Migrated {len(users_to_create)} users")

    def migrate_categories(self):
        """Migrate categories from legacy.products_category"""
        legacy_count = self.count_legacy_records("products_category")
        current_count = Category.objects.filter(
            name__in=[f"Legacy-{i}" for i in range(1, legacy_count + 1)]
        ).count()

        self.stdout.write(f"Legacy categories: {legacy_count}")
        self.stdout.write(f"Already migrated: {current_count}")

        if self.dry_run:
            return

        query = """
        SELECT id, name FROM legacy.products_category 
        WHERE name NOT IN (SELECT name FROM products_category)
        """

        legacy_categories = self.get_legacy_data(query)

        with transaction.atomic():
            # We need to create categories one by one for MPTT to work properly
            categories_created = 0

            for cat_data in legacy_categories:
                category = Category(
                    name=cat_data["name"],
                    description="",
                    parent=None,  # All as root level initially
                    order=cat_data["id"],
                    is_public=True,
                )
                category.save()  # MPTT fields are automatically set on save
                categories_created += 1

            self.stdout.write(f"Migrated {categories_created} categories")

    def migrate_products(self):
        """Migrate products from legacy.products_product"""
        # Ensure we have a default ProductType
        product_type, _ = ProductType.objects.get_or_create(
            name="Menu Item",
            defaults={"description": "Default product type from migration"},
        )

        # Ensure we have a default location for inventory
        main_location, _ = Location.objects.get_or_create(
            name="Main Store",
            defaults={"description": "Main store location from migration"},
        )

        legacy_count = self.count_legacy_records("products_product")
        current_count = Product.objects.filter(legacy_id__isnull=False).count()

        self.stdout.write(f"Legacy products: {legacy_count}")
        self.stdout.write(f"Already migrated: {current_count}")

        if self.dry_run:
            return

        query = """
        SELECT p.id, p.name, p.price, p.description, p.barcode, 
               p.inventory_quantity, p.is_grocery_item, p.category_id,
               p.image,
               c.name as category_name
        FROM legacy.products_product p
        LEFT JOIN legacy.products_category c ON c.id = p.category_id
        WHERE p.id NOT IN (
            SELECT legacy_id FROM products_product WHERE legacy_id IS NOT NULL
        )
        """

        legacy_products = self.get_legacy_data(query)

        with transaction.atomic():
            products_to_create = []
            inventory_stocks_to_create = []
            products_with_images = 0

            for prod_data in legacy_products:
                # Find matching category by name
                category = None
                if prod_data["category_name"]:
                    try:
                        category = Category.objects.get(name=prod_data["category_name"])
                    except Category.DoesNotExist:
                        self.stdout.write(
                            self.style.WARNING(
                                f"Category '{prod_data['category_name']}' not found for product {prod_data['name']}"
                            )
                        )

                # Handle image path migration
                image_path = prod_data.get("image")
                if image_path and image_path.strip():
                    # Remove any leading slash if present to ensure relative path
                    if image_path.startswith('/'):
                        image_path = image_path[1:]
                    # Remove 'media/' prefix if it exists since Django's ImageField handles upload_to
                    if image_path.startswith('media/'):
                        image_path = image_path[6:]
                    products_with_images += 1
                else:
                    image_path = None

                product = Product(
                    product_type=product_type,
                    name=prod_data["name"],
                    description=prod_data["description"] or "",
                    price=prod_data["price"],
                    category=category,
                    is_active=True,  # Assume all legacy products are active
                    is_public=True,
                    barcode=prod_data["barcode"],
                    track_inventory=prod_data["is_grocery_item"],
                    image=image_path,  # Migrate the image path
                    original_filename=None,  # Set to None so signal condition is met
                    legacy_id=prod_data["id"],
                    created_at=timezone.now(),
                    updated_at=timezone.now(),
                )
                products_to_create.append(product)

            # Create products using bulk_create (signals are disconnected anyway)
            Product.objects.bulk_create(products_to_create, batch_size=self.batch_size)
            created_products = Product.objects.filter(legacy_id__isnull=False)
            
            self.stdout.write(f"Migrated {len(products_to_create)} products")
            self.stdout.write(f"Products with images: {products_with_images}")
            
            # Store products with images for later processing
            self.products_needing_image_processing = [
                product for product in products_to_create if product.image
            ]

            # Now create inventory stock records for all migrated products
            for product_data in legacy_products:
                # Find the corresponding created product
                try:
                    product = Product.objects.get(legacy_id=product_data["id"])
                except Product.DoesNotExist:
                    continue
                
                inventory_quantity = product_data.get("inventory_quantity", 0)

                # Create inventory stock record (set negative quantities to 0)
                final_quantity = max(0, inventory_quantity or 0)
                inventory_stock = InventoryStock(
                    product=product, location=main_location, quantity=final_quantity
                )
                inventory_stocks_to_create.append(inventory_stock)

            # Bulk create inventory stock records
            InventoryStock.objects.bulk_create(
                inventory_stocks_to_create, batch_size=self.batch_size
            )
            self.stdout.write(
                f"Created {len(inventory_stocks_to_create)} inventory stock records"
            )

    def migrate_orders(self):
        """Migrate orders from legacy.orders_order and legacy.orders_orderitem"""
        legacy_count = self.count_legacy_records("orders_order")
        current_count = Order.objects.filter(legacy_id__isnull=False).count()

        self.stdout.write(f"Legacy orders: {legacy_count}")
        self.stdout.write(f"Already migrated: {current_count}")

        if self.dry_run:
            return

        # First migrate orders (excluding in progress and pending orders)
        order_query = """
        SELECT id, created_at, updated_at, status, payment_status, total_price,
               user_id, guest_email, guest_first_name, guest_id, guest_last_name,
               source, discount_amount, tip_amount, guest_phone, surcharge_amount,
               subtotal_from_frontend, tax_amount_from_frontend
        FROM legacy.orders_order
        WHERE id NOT IN (
            SELECT legacy_id FROM orders_order WHERE legacy_id IS NOT NULL
        )
        AND status NOT IN ('in_progress', 'pending')
        AND payment_status <> 'pending'
        ORDER BY created_at ASC
        """

        legacy_orders = self.get_legacy_data(order_query)

        with transaction.atomic():
            orders_to_create = []

            self.stdout.write(
                f"Processing {len(legacy_orders)} orders in chronological order (oldest first)..."
            )

            for index, order_data in enumerate(legacy_orders, 1):
                # Map legacy status to new status
                status_mapping = {
                    "pending": Order.OrderStatus.PENDING,
                    "completed": Order.OrderStatus.COMPLETED,
                    "cancelled": Order.OrderStatus.CANCELLED,
                    "hold": Order.OrderStatus.HOLD,
                }

                # Map legacy payment status
                payment_status_mapping = {
                    "paid": Order.PaymentStatus.PAID,
                    "unpaid": Order.PaymentStatus.UNPAID,
                    "partial": Order.PaymentStatus.PARTIALLY_PAID,
                }

                # Map legacy source to order type
                order_type_mapping = {
                    "website": Order.OrderType.WEB,
                    "pos": Order.OrderType.POS,
                    "app": Order.OrderType.APP,
                }

                # Get customer and cashier if exists - logic depends on order source
                customer = None
                cashier = None
                order_source = order_data.get("source", "pos")

                if order_data["user_id"]:
                    try:
                        user = User.objects.get(legacy_id=order_data["user_id"])
                        # For website orders, user_id is typically the customer
                        # For POS orders, user_id could be the cashier
                        if order_source == "website":
                            customer = user
                        else:
                            # For POS orders, determine based on role
                            if user.role in [User.Role.CUSTOMER]:
                                customer = user
                            else:
                                cashier = user
                    except User.DoesNotExist:
                        self.stdout.write(
                            self.style.WARNING(
                                f"User with legacy_id {order_data['user_id']} not found"
                            )
                        )

                # For website orders without user_id, ensure guest information is preserved
                if (
                    order_source == "website"
                    and not customer
                    and not order_data.get("guest_email")
                ):
                    self.stdout.write(
                        self.style.WARNING(
                            f"Website order {order_data['id']} has no customer or guest info"
                        )
                    )

                # Pre-assign order number to ensure chronological order
                # Oldest order gets ORD-00001, newest gets highest number
                order_number = f"ORD-{index:05d}"

                order = Order(
                    id=uuid.uuid4(),
                    order_number=order_number,  # Pre-assign to ensure chronological order
                    status=status_mapping.get(
                        order_data["status"], Order.OrderStatus.PENDING
                    ),
                    order_type=order_type_mapping.get(
                        order_data["source"], Order.OrderType.POS
                    ),
                    payment_status=payment_status_mapping.get(
                        order_data["payment_status"], Order.PaymentStatus.UNPAID
                    ),
                    customer=customer,
                    cashier=cashier,
                    guest_id=order_data["guest_id"],
                    guest_first_name=order_data["guest_first_name"],
                    guest_last_name=order_data["guest_last_name"],
                    guest_email=order_data["guest_email"],
                    guest_phone=order_data["guest_phone"],
                    # Fixed financial mapping: Order only stores base transaction amounts
                    subtotal=(
                        Decimal(str(order_data["subtotal_from_frontend"] or 0))
                        if order_data["subtotal_from_frontend"] is not None
                        else (
                            Decimal(str(order_data["total_price"] or 0))
                            - Decimal(str(order_data["tax_amount_from_frontend"] or 0))
                            - Decimal(str(order_data["tip_amount"] or 0))
                            - Decimal(str(order_data["surcharge_amount"] or 0))
                            + Decimal(str(order_data["discount_amount"] or 0))
                        )
                    ),
                    total_discounts_amount=Decimal(
                        str(order_data["discount_amount"] or 0)
                    ),
                    surcharges_total=Decimal(str(order_data["surcharge_amount"] or 0)),
                    tax_total=Decimal(str(order_data["tax_amount_from_frontend"] or 0)),
                    grand_total=Decimal(
                        str(order_data["total_price"] or 0)
                    ),  # Full legacy total (subtotal - discounts + tax + surcharges + tips)
                    created_at=order_data["created_at"],
                    updated_at=order_data["updated_at"],
                    legacy_id=order_data["id"],
                )
                orders_to_create.append(order)

            # Bulk create orders without order_number (will be generated)
            created_orders = []
            for order in orders_to_create:
                order.save()  # Use save() to generate order_number
                created_orders.append(order)

            self.stdout.write(f"Migrated {len(created_orders)} orders")

            # Now migrate order items
            self.migrate_order_items()

            # Create inventory stock records for any products that don't have them
            self.create_missing_inventory_stocks()

    def migrate_order_items(self):
        """Migrate order items from legacy.orders_orderitem"""
        item_query = """
        SELECT oi.id, oi.quantity, oi.order_id, oi.product_id, oi.unit_price,
               p.price as product_price
        FROM legacy.orders_orderitem oi
        LEFT JOIN legacy.products_product p ON p.id = oi.product_id
        WHERE oi.id NOT IN (
            SELECT legacy_id FROM orders_orderitem WHERE legacy_id IS NOT NULL
        )
        """

        legacy_items = self.get_legacy_data(item_query)

        items_to_create = []

        for item_data in legacy_items:
            # Find the migrated order
            try:
                order = Order.objects.get(legacy_id=item_data["order_id"])
            except Order.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f"Order with legacy_id {item_data['order_id']} not found"
                    )
                )
                continue

            # Find the product
            try:
                product = Product.objects.get(legacy_id=item_data["product_id"])
            except Product.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f"Product with legacy_id {item_data['product_id']} not found"
                    )
                )
                continue

            # Use unit_price if available, otherwise product price
            price_at_sale = (
                item_data["unit_price"] or item_data["product_price"] or product.price
            )

            order_item = OrderItem(
                order=order,
                product=product,
                quantity=item_data["quantity"],
                status=OrderItem.ItemStatus.PENDING,
                price_at_sale=Decimal(str(price_at_sale)),
                legacy_id=item_data["id"],
            )
            items_to_create.append(order_item)

        OrderItem.objects.bulk_create(items_to_create, batch_size=self.batch_size)
        self.stdout.write(f"Migrated {len(items_to_create)} order items")

    def migrate_payments(self):
        """Migrate payments from legacy.payments_payment"""
        legacy_count = self.count_legacy_records("payments_payment")
        current_count = Payment.objects.filter(legacy_id__isnull=False).count()

        self.stdout.write(f"Legacy payments: {legacy_count}")
        self.stdout.write(f"Already migrated: {current_count}")

        if self.dry_run:
            return

        # Enhanced payment query to get order financial data (excluding payments for in progress/pending orders)
        # Process in chronological order (oldest first) to maintain numbering consistency
        payment_query = """
        SELECT p.id, p.amount, p.status, p.created_at, p.updated_at, p.order_id,
               p.payment_method, p.is_split_payment,
               o.tip_amount, o.surcharge_amount, o.total_price as order_total_price
        FROM legacy.payments_payment p
        JOIN legacy.orders_order o ON o.id = p.order_id
        WHERE p.id NOT IN (
            SELECT legacy_id FROM payments_payment WHERE legacy_id IS NOT NULL
        )
        AND o.status NOT IN ('in_progress', 'pending')
        AND o.payment_status != 'pending'
        ORDER BY p.created_at ASC
        """

        legacy_payments = self.get_legacy_data(payment_query)

        with transaction.atomic():
            payments_to_create = []

            self.stdout.write(
                f"Processing {len(legacy_payments)} payments in chronological order (oldest first)..."
            )

            for index, payment_data in enumerate(legacy_payments, 1):
                # Find the migrated order
                try:
                    order = Order.objects.get(legacy_id=payment_data["order_id"])
                except Order.DoesNotExist:
                    self.stdout.write(
                        self.style.WARNING(
                            f"Order with legacy_id {payment_data['order_id']} not found"
                        )
                    )
                    continue

                # Map legacy status to new status
                status_mapping = {
                    "completed": Payment.PaymentStatus.PAID,
                    "pending": Payment.PaymentStatus.PENDING,
                    "failed": Payment.PaymentStatus.UNPAID,
                    "refunded": Payment.PaymentStatus.REFUNDED,
                }

                # Pre-assign payment number to ensure chronological order
                # Oldest payment gets PAY-00001, newest gets highest number
                payment_number = f"PAY-{index:05d}"

                # Fixed financial mapping: Payment stores full financial picture
                tip_amount = Decimal(str(payment_data["tip_amount"] or 0))
                surcharge_amount = Decimal(str(payment_data["surcharge_amount"] or 0))
                # total_amount_due is subtotal + tax (excluding tips and surcharges)
                total_amount_due = order.grand_total - tip_amount - surcharge_amount
                total_collected = Decimal(
                    str(payment_data["order_total_price"] or 0)
                )  # Full legacy total

                payment = Payment(
                    id=uuid.uuid4(),
                    payment_number=payment_number,  # Pre-assign to ensure chronological order
                    order=order,
                    status=status_mapping.get(
                        payment_data["status"], Payment.PaymentStatus.PENDING
                    ),
                    total_amount_due=total_amount_due,
                    amount_paid=total_amount_due,  # Should equal amount_due when paid
                    total_tips=tip_amount,
                    total_surcharges=surcharge_amount,
                    total_collected=total_collected,
                    created_at=payment_data["created_at"],
                    updated_at=payment_data["updated_at"],
                    legacy_id=payment_data["id"],
                )
                payments_to_create.append(payment)

            # Save payments individually to generate payment_number
            created_payments = []
            for payment in payments_to_create:
                payment.save()
                created_payments.append(payment)

            self.stdout.write(f"Migrated {len(created_payments)} payments")

            # Now migrate payment transactions
            self.migrate_payment_transactions()

    def migrate_payment_transactions(self):
        """Migrate payment transactions from legacy.payments_paymenttransaction"""
        # Enhanced transaction query to get payment method and timestamps (excluding transactions for in progress/pending orders)
        transaction_query = """
        SELECT pt.id, pt.amount, pt.parent_payment_id as payment_id, 
               pt.payment_method, pt.status, pt.timestamp as created_at,
               p.is_split_payment, o.tip_amount, o.surcharge_amount
        FROM legacy.payments_paymenttransaction pt
        JOIN legacy.payments_payment p ON p.id = pt.parent_payment_id
        JOIN legacy.orders_order o ON o.id = p.order_id
        WHERE pt.id NOT IN (
            SELECT legacy_id FROM payments_paymenttransaction WHERE legacy_id IS NOT NULL
        )
        AND o.status NOT IN ('in_progress', 'pending')
        AND o.payment_status != 'pending'
        """

        legacy_transactions = self.get_legacy_data(transaction_query)

        transactions_to_create = []

        for trans_data in legacy_transactions:
            # Find the migrated payment
            try:
                payment = Payment.objects.get(legacy_id=trans_data["payment_id"])
            except Payment.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(
                        f"Payment with legacy_id {trans_data['payment_id']} not found"
                    )
                )
                continue

            # Map legacy payment method to new system
            method_mapping = {
                "cash": PaymentTransaction.PaymentMethod.CASH,
                "credit": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
                "debit": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
                "card": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
                "credit_card": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
                "visa": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
                "mastercard": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
                "amex": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
                "discover": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
                "clover_terminal": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            }

            # Map legacy status
            status_mapping = {
                "completed": PaymentTransaction.TransactionStatus.SUCCESSFUL,
                "pending": PaymentTransaction.TransactionStatus.PENDING,
                "failed": PaymentTransaction.TransactionStatus.FAILED,
                "refunded": PaymentTransaction.TransactionStatus.REFUNDED,
                "canceled": PaymentTransaction.TransactionStatus.CANCELED,
            }

            payment_method = method_mapping.get(
                trans_data.get("payment_method", "").strip().lower(),
                PaymentTransaction.PaymentMethod.CASH,
            )

            # Distribute tips and surcharges proportionally for split payments
            tip_amount = Decimal("0.00")
            surcharge_amount = Decimal("0.00")

            # If this is the only transaction or not a split payment, assign full amounts
            total_tip = Decimal(str(trans_data.get("tip_amount", 0)))
            total_surcharge = Decimal(str(trans_data.get("surcharge_amount", 0)))

            if not trans_data.get("is_split_payment", False):
                tip_amount = total_tip
                surcharge_amount = total_surcharge
            else:
                # For split payments, we'd need to calculate proportional distribution
                # For now, assign to first transaction (can be refined later)
                existing_transactions = PaymentTransaction.objects.filter(
                    payment=payment
                ).count()
                if existing_transactions == 0:
                    tip_amount = total_tip
                    surcharge_amount = total_surcharge

            transaction = PaymentTransaction(
                id=uuid.uuid4(),
                payment=payment,
                amount=Decimal(str(trans_data["amount"] or 0)),
                tip=tip_amount,
                surcharge=surcharge_amount,
                method=payment_method,
                status=status_mapping.get(
                    trans_data.get("status", "").lower(),
                    PaymentTransaction.TransactionStatus.SUCCESSFUL,
                ),
                created_at=trans_data.get("created_at")
                or payment.created_at
                or timezone.now(),
                legacy_id=trans_data["id"],
            )
            transactions_to_create.append(transaction)

        PaymentTransaction.objects.bulk_create(
            transactions_to_create, batch_size=self.batch_size
        )
        self.stdout.write(
            f"Migrated {len(transactions_to_create)} payment transactions"
        )

    def validate_migration(self):
        """Validate the migration results"""
        self.stdout.write("\n--- Migration Validation ---")

        validations = [
            ("Users", "users_customuser", User.objects.filter(legacy_id__isnull=False)),
            ("Categories", "products_category", Category.objects.all()),
            (
                "Products",
                "products_product",
                Product.objects.filter(legacy_id__isnull=False),
            ),
            ("Orders", "orders_order", Order.objects.filter(legacy_id__isnull=False)),
            (
                "Order Items",
                "orders_orderitem",
                OrderItem.objects.filter(legacy_id__isnull=False),
            ),
            (
                "Payments",
                "payments_payment",
                Payment.objects.filter(legacy_id__isnull=False),
            ),
            (
                "Payment Transactions",
                "payments_paymenttransaction",
                PaymentTransaction.objects.filter(legacy_id__isnull=False),
            ),
        ]

        for name, legacy_table, new_queryset in validations:
            legacy_count = self.count_legacy_records(legacy_table)
            new_count = new_queryset.count()

            if legacy_count == new_count:
                self.stdout.write(
                    self.style.SUCCESS(f"✓ {name}: {new_count}/{legacy_count}")
                )
            else:
                self.stdout.write(
                    self.style.WARNING(f"⚠ {name}: {new_count}/{legacy_count}")
                )

        # Additional validation: Check chronological ordering
        self.validate_chronological_ordering()

    def validate_chronological_ordering(self):
        """Validate that orders and payments are numbered chronologically"""
        self.stdout.write("\n--- Chronological Ordering Validation ---")

        # Check orders
        orders_with_legacy = Order.objects.filter(
            legacy_id__isnull=False, order_number__isnull=False
        ).order_by("created_at")

        if orders_with_legacy.exists():
            first_order = orders_with_legacy.first()
            last_order = orders_with_legacy.last()

            self.stdout.write(f"Orders chronological check:")
            self.stdout.write(
                f"  Oldest order: {first_order.order_number} (created: {first_order.created_at})"
            )
            self.stdout.write(
                f"  Newest order: {last_order.order_number} (created: {last_order.created_at})"
            )

            # Check if numbering is sequential
            expected_sequential = True
            previous_number = None

            for order in orders_with_legacy[:5]:  # Check first 5
                if order.order_number and order.order_number.startswith("ORD-"):
                    try:
                        current_number = int(order.order_number.split("-")[1])
                        if previous_number and current_number != previous_number + 1:
                            expected_sequential = False
                            break
                        previous_number = current_number
                    except (ValueError, IndexError):
                        expected_sequential = False
                        break

            if expected_sequential:
                self.stdout.write(
                    self.style.SUCCESS("✓ Order numbers appear to be sequential")
                )
            else:
                self.stdout.write(
                    self.style.WARNING("⚠ Order numbers may not be sequential")
                )

            # Check if first order is ORD-00001
            if first_order.order_number == "ORD-00001":
                self.stdout.write(
                    self.style.SUCCESS("✓ Oldest order has ORD-00001 as expected")
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"⚠ Oldest order is {first_order.order_number}, expected ORD-00001"
                    )
                )

        # Check payments
        payments_with_legacy = Payment.objects.filter(
            legacy_id__isnull=False, payment_number__isnull=False
        ).order_by("created_at")

        if payments_with_legacy.exists():
            first_payment = payments_with_legacy.first()
            last_payment = payments_with_legacy.last()

            self.stdout.write(f"Payments chronological check:")
            self.stdout.write(
                f"  Oldest payment: {first_payment.payment_number} (created: {first_payment.created_at})"
            )
            self.stdout.write(
                f"  Newest payment: {last_payment.payment_number} (created: {last_payment.created_at})"
            )

            # Check if first payment is PAY-00001
            if first_payment.payment_number == "PAY-00001":
                self.stdout.write(
                    self.style.SUCCESS("✓ Oldest payment has PAY-00001 as expected")
                )
            else:
                self.stdout.write(
                    self.style.WARNING(
                        f"⚠ Oldest payment is {first_payment.payment_number}, expected PAY-00001"
                    )
                )

    def cleanup_post_migration(self):
        """
        Cleanup tasks after migration, ensuring complete data integrity by
        recalculating all financial totals from the ground up and forcing synchronization.
        """
        self.stdout.write("\n--- Post-Migration Cleanup and Final Recalculation ---")

        from mptt.models import MPTTModel

        Category.objects.rebuild()
        self.stdout.write("✓ Rebuilt category MPTT tree")

        orders_to_process = Order.objects.filter(
            legacy_id__isnull=False, payment_details__isnull=False
        ).select_related("payment_details")

        updated_records = 0
        self.stdout.write(
            f"Validating and recalculating totals for {orders_to_process.count()} orders..."
        )

        for order in orders_to_process:
            payment = order.payment_details
            needs_saving = False

            # Step 1: Calculate the true subtotal from items.
            correct_subtotal = sum(item.total_price for item in order.items.all())

            # Step 2: Calculate the one, true final total.
            true_final_total = (
                correct_subtotal
                - order.total_discounts_amount
                + order.tax_total
                + payment.total_surcharges
                + payment.total_tips
            )

            # Step 3: Check and update all relevant fields on both models.
            if order.subtotal != correct_subtotal:
                order.subtotal = correct_subtotal
                needs_saving = True

            if payment.total_collected != true_final_total:
                payment.total_collected = true_final_total
                payment.save(update_fields=["total_collected"])

            if order.grand_total != true_final_total:
                order.grand_total = true_final_total
                needs_saving = True

            if needs_saving:
                order.save(update_fields=["subtotal", "grand_total"])
                updated_records += 1

        if updated_records > 0:
            self.stdout.write(
                f"✓ Corrected and synced totals for {updated_records} records."
            )

        # --- FINAL FORCED SYNC STEP ---
        self.stdout.write("\n--- Forcing Final Sync from Order to Payment ---")
        final_sync_count = 0
        # Re-query the orders to ensure we have the latest saved data
        for order in Order.objects.filter(
            legacy_id__isnull=False, payment_details__isnull=False
        ).select_related("payment_details"):
            payment = order.payment_details
            if payment.total_collected != order.grand_total:
                payment.total_collected = order.grand_total
                payment.save(update_fields=["total_collected"])
                final_sync_count += 1

        if final_sync_count > 0:
            self.stdout.write(
                f"✓ Force-synced {final_sync_count} payment records to match final order totals."
            )
        else:
            self.stdout.write("✓ All payment records were already in sync.")

        self.stdout.write("✓ Post-migration cleanup completed.")

    def process_migrated_product_images(self):
        """Process images for migrated products after signals are reconnected"""
        if not self.products_needing_image_processing:
            return
            
        self.stdout.write(f"\n--- Processing Images for {len(self.products_needing_image_processing)} Products ---")
        
        for i, product_data in enumerate(self.products_needing_image_processing, 1):
            try:
                # Get the actual product from the database
                product = Product.objects.get(legacy_id=product_data.legacy_id)
                self.stdout.write(f"Processing image {i}/{len(self.products_needing_image_processing)}: {product.name}")
                
                # Save the product to trigger image processing signals
                # The signal will detect that image.name != original_filename and process it
                product.save()
                
            except Product.DoesNotExist:
                self.stdout.write(
                    self.style.WARNING(f"Product with legacy_id {product_data.legacy_id} not found")
                )
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(f"Error processing image for product {product_data.name}: {e}")
                )
        
        self.stdout.write(self.style.SUCCESS(f"✓ Queued image processing for {len(self.products_needing_image_processing)} products"))
        self.stdout.write("Note: Images will be processed asynchronously by Celery workers")

    def create_missing_inventory_stocks(self):
        """Create inventory stock records for products that don't have them"""
        # Get or create main location
        main_location, _ = Location.objects.get_or_create(
            name="Main Store", defaults={"description": "Main store location"}
        )

        # Find products without inventory stock records
        products_without_stock = Product.objects.filter(
            legacy_id__isnull=False
        ).exclude(stock_levels__location=main_location)

        inventory_stocks_to_create = []
        for product in products_without_stock:
            inventory_stock = InventoryStock(
                product=product,
                location=main_location,
                quantity=0,  # Default to 0 if not specified
            )
            inventory_stocks_to_create.append(inventory_stock)

        if inventory_stocks_to_create:
            InventoryStock.objects.bulk_create(
                inventory_stocks_to_create, batch_size=self.batch_size
            )
            self.stdout.write(
                f"✓ Created {len(inventory_stocks_to_create)} missing inventory stock records"
            )
