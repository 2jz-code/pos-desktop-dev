import os
import requests
import time
from decimal import Decimal, InvalidOperation

from django.core.management.base import BaseCommand
from django.db import transaction, IntegrityError
from django.db.utils import OperationalError
from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from django.db.models.signals import post_save
from django.core.files.base import ContentFile
from urllib.parse import urljoin

# --- Model Imports ---
from products.models import Product, Category, ProductType, Tax
from inventory.models import InventoryStock, Location
from users.models import User
from orders.models import Order, OrderItem
from payments.models import Payment, PaymentTransaction
from dotenv import load_dotenv

# --- Signal Imports ---
from notifications.signals import handle_order_status_completion

# Load environment variables from .env file
load_dotenv()

# User = get_user_model() # Defined in the global scope


class Command(BaseCommand):
    help = "Final Corrected: Migrates all data, fetching related payment records separately."

    def retry_on_db_lock(self, func, max_retries=5, delay=0.5):
        """Retry function on database lock with exponential backoff"""
        for attempt in range(max_retries):
            try:
                return func()
            except OperationalError as e:
                if "database is locked" in str(e).lower() and attempt < max_retries - 1:
                    wait_time = delay * (2 ** attempt)  # Exponential backoff
                    self.stdout.write(
                        self.style.WARNING(
                            f"Database locked, retrying in {wait_time:.1f}s... (attempt {attempt + 1}/{max_retries})"
                        )
                    )
                    time.sleep(wait_time)
                    continue
                else:
                    raise

    def handle(self, *args, **options):
        self.stdout.write(
            self.style.WARNING(
                "Temporarily disconnecting order completion email signal to prevent emails during migration."
            )
        )
        post_save.disconnect(handle_order_status_completion, sender=Order)

        try:
            self._execute_migration()
        finally:
            post_save.connect(handle_order_status_completion, sender=Order)
            self.stdout.write(
                self.style.SUCCESS("Reconnected order completion email signal.")
            )

    def _execute_migration(self):
        # ... (handle method is unchanged) ...
        self.stdout.write(self.style.SUCCESS("🚀 Starting full data migration..."))
        self.old_backend_url = os.environ.get("OLD_BACKEND_API_URL")
        self.admin_user = os.environ.get("OLD_BACKEND_ADMIN_USER")
        self.admin_password = os.environ.get("OLD_BACKEND_ADMIN_PASSWORD")
        if not all([self.old_backend_url, self.admin_user, self.admin_password]):
            self.stdout.write(
                self.style.ERROR("Missing environment variables. Halting.")
            )
            return
        self.access_token = self._get_access_token()
        if not self.access_token:
            return

        self.stdout.write(
            self.style.HTTP_INFO("\n--- Stage 0: Creating Prerequisites ---")
        )
        self._create_prerequisites()

        # --- Stage 1: Migrating Users ---
        self.stdout.write(self.style.HTTP_INFO("\n--- Stage 1: Migrating Users ---"))
        users_data = self._fetch_all_paginated_data(
            f"{self.old_backend_url}/api/auth/users/"
        )
        if users_data is None:
            return

        for user_data in users_data:
            legacy_id = user_data.get("id")
            if not legacy_id:
                continue

            username = user_data.get("username")
            email = user_data.get("email")

            # --- New, Safer Logic ---
            # Try to find an existing user by username or email first.
            existing_user = None
            if username:
                existing_user = User.objects.filter(username__iexact=username).first()
            if not existing_user and email:
                existing_user = User.objects.filter(email__iexact=email).first()

            if existing_user:
                # User already exists. Only update the legacy_id if it's not already set.
                if not existing_user.legacy_id:
                    self.stdout.write(
                        self.style.WARNING(
                            f"  - Found existing user '{existing_user.username}'. Assigning legacy_id {legacy_id} to it."
                        )
                    )
                    existing_user.legacy_id = legacy_id
                    existing_user.save(update_fields=["legacy_id"])
                else:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  - Skipping existing user '{existing_user.username}' which already has a legacy_id."
                        )
                    )
                continue

            # --- If no existing user, create a new one ---
            defaults = {
                "email": email or f"user_{legacy_id}@placeholder.ajeen.com",
                "username": username,
                "first_name": user_data.get("first_name", ""),
                "last_name": user_data.get("last_name", ""),
                "is_staff": user_data.get("is_staff", False),
                "is_superuser": user_data.get("is_superuser", False),
                "password": "!",  # Invalid password
                "role": user_data.get("role", "CUSTOMER").upper(),
                "is_pos_staff": user_data.get("is_pos_user", False),
            }

            try:
                # Use update_or_create with legacy_id to be idempotent,
                # but it should mostly be creating new users here.
                User.objects.update_or_create(legacy_id=legacy_id, defaults=defaults)
            except IntegrityError as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"  - FAILED to create user with legacy_id {legacy_id}. Error: {e}"
                    )
                )

        self.stdout.write(self.style.SUCCESS(f"  Processed {len(users_data)} users."))

        # --- Stage 2: Migrating Products ---
        self.stdout.write(self.style.HTTP_INFO("\n--- Stage 2: Migrating Products ---"))
        product_data = self._fetch_all_paginated_data(
            f"{self.old_backend_url}/api/products/"
        )
        if product_data is None:
            return

        # Pre-create categories
        category_names = {
            prod.get("category_name")
            for prod in product_data
            if prod.get("category_name")
        }
        for name in category_names:
            Category.objects.get_or_create(name=name)

        default_prod_type = ProductType.objects.get(id=1)
        default_tax = Tax.objects.get(name="No Tax")
        default_location = Location.objects.get(name="Main Stockroom")

        for row in product_data:
            legacy_id = row.get("id")
            if not legacy_id:
                continue

            barcode = row.get("barcode")
            if barcode and barcode.strip() == "":
                barcode = None

            category = None
            if row.get("category_name"):
                category = Category.objects.get(name=row["category_name"])

            defaults = {
                "name": row["name"],
                "product_type": default_prod_type,
                "description": row.get("description", ""),
                "price": Decimal(row.get("price", "0.00")),
                "category": category,
                "barcode": barcode,
                "track_inventory": row.get("is_grocery_item", False),
            }

            try:
                with transaction.atomic():
                    product, created = Product.objects.update_or_create(
                        legacy_id=legacy_id, defaults=defaults
                    )
                    if created:
                        product.taxes.add(default_tax)

                    # --- Image Migration Logic ---
                    image_url = row.get("image")
                    if image_url and not product.image:
                        try:
                            # Construct the full URL
                            full_image_url = urljoin(self.old_backend_url, image_url)

                            # Fetch the image
                            response = requests.get(full_image_url, stream=True)
                            response.raise_for_status()

                            # Get the filename from the URL
                            file_name = os.path.basename(image_url)

                            # Save the image to the product's image field
                            product.image.save(
                                file_name, ContentFile(response.content), save=True
                            )
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f"  - Successfully migrated image for product: {product.name}"
                                )
                            )

                        except requests.exceptions.RequestException as e:
                            self.stdout.write(
                                self.style.ERROR(
                                    f"  - FAILED to download image for product {legacy_id} from {full_image_url}. Error: {e}"
                                )
                            )
                        except Exception as e:
                            self.stdout.write(
                                self.style.ERROR(
                                    f"  - FAILED to save image for product {legacy_id}. Error: {e}"
                                )
                            )
                    # --- End of Image Migration Logic ---

            except IntegrityError as e:
                if "UNIQUE constraint" in str(e) and "barcode" in str(e):
                    try:
                        with transaction.atomic():
                            # The barcode is the thing that's conflicting. Find the existing product.
                            conflicting_product = Product.objects.filter(
                                barcode=barcode
                            ).first()
                            if conflicting_product:
                                self.stdout.write(
                                    self.style.WARNING(
                                        f"  - Found existing product with barcode '{barcode}'. Merging with legacy product ID {legacy_id}."
                                    )
                                )
                                # Update the existing product with the legacy ID and other info
                                for key, value in defaults.items():
                                    setattr(conflicting_product, key, value)
                                conflicting_product.legacy_id = legacy_id
                                conflicting_product.save()
                                conflicting_product.taxes.add(default_tax)
                            else:
                                self.stdout.write(
                                    self.style.ERROR(
                                        f"  - FAILED to process product with legacy_id {legacy_id} due to an unhandled barcode IntegrityError."
                                    )
                                )
                    except Exception as merge_e:
                        self.stdout.write(
                            self.style.ERROR(
                                f"  - FAILED to merge product with legacy_id {legacy_id}. Error: {merge_e}"
                            )
                        )
                else:
                    # Some other integrity error occurred
                    self.stdout.write(
                        self.style.ERROR(
                            f"  - FAILED to process product with legacy_id {legacy_id}. Error: {e}"
                        )
                    )
                continue

            if product.track_inventory:
                quantity = Decimal(row.get("inventory_quantity", "0.00"))
                InventoryStock.objects.update_or_create(
                    product=product,
                    location=default_location,
                    defaults={"quantity": quantity},
                )
        self.stdout.write(
            self.style.SUCCESS(f"  Processed {len(product_data)} products.")
        )

        # --- Stage 3: Migrating Orders & Payments ---
        self.stdout.write(
            self.style.HTTP_INFO("\n--- Stage 3: Migrating Orders & Payments ---")
        )
        ORDER_STATUS_MAP = {
            "completed": Order.OrderStatus.COMPLETED,
            "voided": Order.OrderStatus.VOID,
            "saved": Order.OrderStatus.HOLD,
            "in-progress": Order.OrderStatus.PENDING,
            "pending": Order.OrderStatus.PENDING,
            "cancelled": Order.OrderStatus.CANCELLED,
        }
        PAYMENT_STATUS_MAP = {
            "paid": Payment.PaymentStatus.PAID,
            "completed": Payment.PaymentStatus.PAID,
            "pending": Payment.PaymentStatus.PENDING,
            "failed": Payment.PaymentStatus.UNPAID,
            "refunded": Payment.PaymentStatus.REFUNDED,
            "partially_refunded": Payment.PaymentStatus.PARTIALLY_REFUNDED,
        }
        PAYMENT_METHOD_MAP = {
            "cash": PaymentTransaction.PaymentMethod.CASH,
            "credit": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            "card": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            "clover_terminal": PaymentTransaction.PaymentMethod.CARD_TERMINAL,
            "split": PaymentTransaction.PaymentMethod.CASH,  # Default for split
        }
        orders_data = self._fetch_all_paginated_data(
            f"{self.old_backend_url}/api/orders/"
        )
        if orders_data is None:
            return

        self.stdout.write(
            self.style.HTTP_INFO(
                "  -> Reversing fetched orders to process oldest first."
            )
        )
        orders_data.reverse()

        payments_data = self._fetch_all_paginated_data(
            f"{self.old_backend_url}/api/payments/"
        )
        if payments_data is None:
            return
        payments_by_order_legacy_id = {p["order"]: p for p in payments_data}

        for order_summary_data in orders_data:
            legacy_order_id = order_summary_data.get("id")
            if not legacy_order_id:
                continue

            try:
                detail_response = requests.get(
                    f"{self.old_backend_url}/api/orders/{legacy_order_id}/",
                    cookies={"pos_access_token": self.access_token},
                )
                detail_response.raise_for_status()
                old_order_data = detail_response.json()
            except requests.exceptions.RequestException as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"    - FAILED to fetch details for order {legacy_order_id}: {e}"
                    )
                )
                continue

            # Use retry logic for the entire order+payment creation process
            def create_order_and_payment():
                return self._create_single_order_with_payment(
                    legacy_order_id, old_order_data, payments_by_order_legacy_id,
                    ORDER_STATUS_MAP, PAYMENT_STATUS_MAP, PAYMENT_METHOD_MAP
                )
            
            try:
                self.retry_on_db_lock(create_order_and_payment)
            except Exception as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"    - FAILED to create order {legacy_order_id} after retries: {e}"
                    )
                )
                continue

        self.stdout.write(
            self.style.SUCCESS(
                f"  Processed {len(orders_data)} orders and their associated payments."
            )
        )

    def _get_access_token(self):
        # ... (unchanged) ...
        try:
            self.stdout.write(f"Authenticating with {self.old_backend_url}...")
            response = requests.post(
                f"{self.old_backend_url}/api/auth/login/",
                data={"username": self.admin_user, "password": self.admin_password},
            )
            response.raise_for_status()
            token = response.cookies.get("pos_access_token")
            self.stdout.write(self.style.SUCCESS("Authentication successful."))
            return token
        except requests.exceptions.RequestException as e:
            self.stdout.write(self.style.ERROR(f"Error authenticating: {e}"))
            return None

    def _create_prerequisites(self):
        # ... (unchanged) ...
        ProductType.objects.get_or_create(id=1, defaults={"name": "Standard Product"})
        Tax.objects.get_or_create(name="No Tax", defaults={"rate": 0.0})
        Location.objects.get_or_create(
            name="Main Stockroom",
            defaults={"description": "Default location for migrated inventory."},
        )
        self.stdout.write("  - Ensured all prerequisite records exist.")

    def _migrate_users(self):
        # ... (unchanged) ...
        response = requests.get(
            f"{self.old_backend_url}/api/auth/users/",
            cookies={"pos_access_token": self.access_token},
        )
        response.raise_for_status()
        users_data = response.json()
        created_count = 0
        skipped_count = 0
        for user_data in users_data:
            username = user_data.get("username")
            email = user_data.get("email")
            if not username:
                skipped_count += 1
                continue
            if not email:
                email = f"{username.lower().replace(' ', '_')}@placeholder.ajeen.com"
            if User.objects.filter(
                Q(email__iexact=email) | Q(username__iexact=username)
            ).exists():
                skipped_count += 1
                continue
            role = user_data.get("role", "CUSTOMER").upper()
            is_pos_staff_flag = user_data.get("is_pos_user", False)
            User.objects.create(
                id=user_data.get("id"),
                email=email,
                username=username,
                first_name=user_data.get("first_name", ""),
                last_name=user_data.get("last_name", ""),
                is_staff=user_data.get("is_staff", False),
                is_superuser=user_data.get("is_superuser", False),
                password="!",
                role=role,
                is_pos_staff=is_pos_staff_flag,
            )
            created_count += 1
        self.stdout.write(
            self.style.SUCCESS(
                f"  User migration complete: {created_count} users created, {skipped_count} users skipped."
            )
        )

    def _migrate_products_and_inventory(self):
        # ... (unchanged) ...
        response = requests.get(
            f"{self.old_backend_url}/api/products/",
            cookies={"pos_access_token": self.access_token},
        )
        response.raise_for_status()
        product_data = response.json()
        default_prod_type = ProductType.objects.get(id=1)
        default_tax = Tax.objects.get(name="No Tax")
        default_location = Location.objects.get(name="Main Stockroom")
        category_names = {
            prod["category_name"] for prod in product_data if prod.get("category_name")
        }
        for name in category_names:
            Category.objects.get_or_create(name=name)
        used_barcodes = set()
        for row in product_data:
            barcode = row.get("barcode")
            product_id = row.get("id")
            if not barcode or barcode.strip() == "":
                barcode = None
            if barcode and barcode in used_barcodes:
                barcode = None
            elif barcode:
                used_barcodes.add(barcode)
            if not product_id:
                continue
            product, created = Product.objects.update_or_create(
                id=int(product_id),
                defaults={
                    "name": row["name"],
                    "product_type": default_prod_type,
                    "description": row.get("description", ""),
                    "price": Decimal(row.get("price", "0.00")),
                    "category": (
                        Category.objects.get(name=row["category_name"])
                        if row.get("category_name")
                        else None
                    ),
                    "barcode": barcode,
                    "track_inventory": row.get("is_grocery_item", False),
                },
            )
            product.taxes.add(default_tax)
            if product.track_inventory:
                quantity = Decimal(row.get("inventory_quantity", "0.00"))
                InventoryStock.objects.update_or_create(
                    product=product,
                    location=default_location,
                    defaults={"quantity": quantity},
                )
        self.stdout.write(
            self.style.SUCCESS(
                f"  Processed {len(product_data)} products and their inventory stock records."
            )
        )

    def _fetch_all_paginated_data(self, url):
        """Fetches all items from a paginated API endpoint."""
        all_data = []
        next_url = url
        self.stdout.write(f"  - Fetching all data from {url}...")
        while next_url:
            response = requests.get(
                next_url,
                cookies={"pos_access_token": self.access_token},
            )
            response.raise_for_status()
            data = response.json()

            # Handle both paginated (dict) and non-paginated (list) responses
            if isinstance(data, list):
                all_data.extend(data)
                break
            elif isinstance(data, dict) and "results" in data:
                all_data.extend(data["results"])
                next_url = data.get("next")
                if next_url:
                    self.stdout.write(f"    - Following pagination to next page...")
            else:
                self.stdout.write(
                    self.style.ERROR(
                        f"  - ERROR: Unexpected API response format from {next_url}."
                    )
                )
                self.stdout.write(self.style.ERROR(f"     Response: {data}"))
                return None  # Indicate failure

        self.stdout.write(f"  - Successfully fetched {len(all_data)} total items.")
        return all_data

    @transaction.atomic
    def _create_single_order_with_payment(self, legacy_order_id, old_order_data, payments_by_order_legacy_id, ORDER_STATUS_MAP, PAYMENT_STATUS_MAP, PAYMENT_METHOD_MAP):
        """Create a single order with its payment and transactions atomically"""
        
        # --- Get Financial Data Directly from API Response ---
        recalculated_subtotal = sum(
            Decimal(item.get("quantity", "0"))
            * Decimal(item.get("unit_price", "0.00"))
            for item in old_order_data.get("items", [])
        )
        grand_total = Decimal(old_order_data.get("total_price") or "0.00")
        discount_amount = Decimal(old_order_data.get("discount_amount") or "0.00")
        tax_total = Decimal(
            old_order_data.get("tax_amount_from_frontend") or "0.00"
        )

        cashier = User.objects.filter(legacy_id=old_order_data.get("user")).first()
        customer = User.objects.filter(
            legacy_id=old_order_data.get("rewards_profile_id")
        ).first()

        new_order, _ = Order.objects.update_or_create(
            legacy_id=legacy_order_id,
            defaults={
                "status": ORDER_STATUS_MAP.get(
                    old_order_data.get("status", "pending"),
                    Order.OrderStatus.PENDING,
                ),
                "order_type": (
                    Order.OrderType.POS
                    if old_order_data.get("source") == "pos"
                    else Order.OrderType.WEB
                ),
                "payment_status": PAYMENT_STATUS_MAP.get(
                    old_order_data.get("payment_status"), Order.PaymentStatus.UNPAID
                ),
                "cashier": cashier,
                "customer": customer,
                "subtotal": recalculated_subtotal,
                "total_discounts_amount": discount_amount,
                "tax_total": tax_total,
                "grand_total": grand_total,
                "created_at": (
                    parse_datetime(old_order_data["created_at"])
                    if old_order_data.get("created_at")
                    else timezone.now()
                ),
                "updated_at": (
                    parse_datetime(old_order_data["updated_at"])
                    if old_order_data.get("updated_at")
                    else timezone.now()
                ),
            },
        )

        # Create order items
        for item_data in old_order_data.get("items", []):
            legacy_item_id = item_data.get("id")
            if not legacy_item_id:
                continue
            product_data = item_data.get("product")
            if not product_data:
                continue
            product = Product.objects.filter(
                legacy_id=product_data.get("id")
            ).first()
            if not product:
                continue

            OrderItem.objects.update_or_create(
                legacy_id=legacy_item_id,
                defaults={
                    "order": new_order,
                    "product": product,
                    "quantity": item_data["quantity"],
                    "price_at_sale": item_data.get("unit_price") or product.price,
                },
            )

        # Create payment and transactions
        old_payment_data = payments_by_order_legacy_id.get(legacy_order_id)
        if old_payment_data:
            legacy_payment_id = old_payment_data.get("id")
            if legacy_payment_id:
                # --- CORRECTED: Use Old System Values Directly ---
                order_tip = Decimal(old_order_data.get("tip_amount") or "0.00")
                order_surcharge = Decimal(old_order_data.get("surcharge_amount") or "0.00")
                
                # Calculate base order amount (what customer owed for items/tax, excluding tips/surcharges)
                base_order_amount = new_order.subtotal + new_order.tax_total - new_order.total_discounts_amount

                payment, _ = Payment.objects.update_or_create(
                    legacy_id=legacy_payment_id,
                    defaults={
                        "order": new_order,
                        "status": PAYMENT_STATUS_MAP.get(
                            old_payment_data.get("status"), Payment.PaymentStatus.UNPAID
                        ),
                        "total_amount_due": base_order_amount,
                        "amount_paid": base_order_amount,
                        "total_tips": order_tip,
                        "total_surcharges": order_surcharge,
                        "total_collected": new_order.grand_total,
                        "created_at": (
                            parse_datetime(old_payment_data["created_at"])
                            if old_payment_data.get("created_at")
                            else new_order.created_at
                        ),
                        "updated_at": (
                            parse_datetime(old_payment_data["updated_at"])
                            if old_payment_data.get("updated_at")
                            else new_order.created_at
                        ),
                    },
                )

                # Create transactions
                transactions = old_payment_data.get("transactions", [])
                for txn_data in transactions:
                    legacy_txn_id = txn_data.get("id")
                    if not legacy_txn_id:
                        continue

                    transaction_amount = Decimal(txn_data.get("amount") or "0.00")

                    method = PAYMENT_METHOD_MAP.get(
                        txn_data.get("payment_method"),
                        PaymentTransaction.PaymentMethod.CASH,
                    )
                    if (
                        new_order.order_type == Order.OrderType.WEB
                        and txn_data.get("payment_method") == "credit"
                    ):
                        method = PaymentTransaction.PaymentMethod.CARD_ONLINE

                    PaymentTransaction.objects.update_or_create(
                        legacy_id=legacy_txn_id,
                        defaults={
                            "payment": payment,
                            "transaction_id": txn_data.get("transaction_id"),
                            "amount": transaction_amount,
                            "method": method,
                            "status": (
                                PaymentTransaction.TransactionStatus.SUCCESSFUL
                                if txn_data.get("status") in ["completed", "paid"]
                                else PaymentTransaction.TransactionStatus.FAILED
                            ),
                            "tip": Decimal("0.00"),
                            "surcharge": Decimal("0.00"),
                            "created_at": (
                                parse_datetime(txn_data["timestamp"])
                                if txn_data.get("timestamp")
                                else new_order.created_at
                            ),
                        },
                    )

        return new_order

    def _migrate_orders_and_payments(self):
        self.stdout.write("  - Fetching orders and payments from JSON endpoints...")

        # Fetch all orders using the paginated helper
        orders_data = self._fetch_all_paginated_data(
            f"{self.old_backend_url}/api/orders/"
        )
        if orders_data is None:
            self.stdout.write(
                self.style.ERROR("Halting migration due to error fetching orders.")
            )
            return

        # Fetch all payments using the paginated helper
        payments_data = self._fetch_all_paginated_data(
            f"{self.old_backend_url}/api/payments/"
        )
        if payments_data is None:
            self.stdout.write(
                self.style.ERROR("Halting migration due to error fetching payments.")
            )
            return

        payments_by_order_id = {p["order"]: p for p in payments_data}

        for order_summary_data in orders_data:
            order_id = order_summary_data["id"]
            self.stdout.write(f"  - Processing order ID: {order_id}")

            # Fetch the full order details to get the items list
            try:
                detail_response = requests.get(
                    f"{self.old_backend_url}/api/orders/{order_id}/",
                    cookies={"pos_access_token": self.access_token},
                )
                detail_response.raise_for_status()
                old_order_data = detail_response.json()
            except requests.exceptions.RequestException as e:
                self.stdout.write(
                    self.style.ERROR(
                        f"    - FAILED to fetch details for order {order_id}: {e}"
                    )
                )
                continue  # Skip to the next order

            cashier = User.objects.filter(id=old_order_data.get("user")).first()
            customer = User.objects.filter(
                id=old_order_data.get("rewards_profile_id")
            ).first()

            # --- Recalculate Financials from Line Items for Accuracy ---
            recalculated_subtotal = Decimal("0.00")
            for item_data in old_order_data.get("items", []):
                try:
                    quantity = Decimal(item_data.get("quantity", "0"))
                    price = Decimal(item_data.get("unit_price", "0.00"))
                    recalculated_subtotal += quantity * price
                except (InvalidOperation, TypeError):
                    self.stdout.write(
                        self.style.WARNING(
                            f"    - WARNING: Invalid numeric data for item in order {order_id}. Skipping item in subtotal calculation."
                        )
                    )
                    continue

            grand_total = Decimal(old_order_data.get("total_price", "0.00"))
            discount_amount = Decimal(old_order_data.get("discount_amount", "0.00"))

            # tax_total = grand_total - subtotal + discount
            recalculated_tax_total = (
                grand_total - recalculated_subtotal + discount_amount
            )

            if recalculated_tax_total < 0:
                self.stdout.write(
                    self.style.WARNING(
                        f"    - WARNING: Calculated negative tax for order {order_id}. Setting tax to 0. Check data consistency."
                    )
                )
                recalculated_tax_total = Decimal("0.00")

            new_order, created = Order.objects.update_or_create(
                id=old_order_data["id"],
                defaults={
                    "order_number": f"OLD-{old_order_data['id']}",
                    "status": ORDER_STATUS_MAP.get(
                        old_order_data.get("status", "pending"),
                        Order.OrderStatus.PENDING,
                    ),
                    "order_type": (
                        Order.OrderType.POS
                        if old_order_data.get("source") == "pos"
                        else Order.OrderType.WEB
                    ),
                    "payment_status": PAYMENT_STATUS_MAP.get(
                        old_order_data.get("payment_status"), Order.PaymentStatus.UNPAID
                    ),
                    "cashier": cashier,
                    "customer": customer,
                    "subtotal": recalculated_subtotal,
                    "total_discounts_amount": discount_amount,
                    "tax_total": recalculated_tax_total,
                    "grand_total": grand_total,
                    "created_at": (
                        parse_datetime(old_order_data["created_at"])
                        if old_order_data.get("created_at")
                        else timezone.now()
                    ),
                    "updated_at": (
                        parse_datetime(old_order_data["updated_at"])
                        if old_order_data.get("updated_at")
                        else timezone.now()
                    ),
                },
            )
            if created:
                Order.objects.filter(id=new_order.id).update(
                    updated_at=new_order.created_at
                )

            for item_data in old_order_data.get("items", []):
                product = Product.objects.filter(id=item_data.get("product")).first()
                if not product:
                    continue
                OrderItem.objects.update_or_create(
                    id=item_data["id"],
                    order=new_order,
                    product=product,
                    defaults={
                        "quantity": item_data["quantity"],
                        "price_at_sale": item_data.get("unit_price") or product.price,
                    },
                )

            old_payment_data = payments_by_order_id.get(new_order.id)
            if old_payment_data:
                payment, _ = Payment.objects.update_or_create(
                    id=old_payment_data["id"],
                    order=new_order,
                    defaults={
                        "payment_number": f"PAY-OLD-{old_payment_data['id']}",
                        "status": PAYMENT_STATUS_MAP.get(
                            old_payment_data.get("status"),
                            Payment.PaymentStatus.UNPAID,
                        ),
                        "total_amount_due": new_order.grand_total,
                        "amount_paid": old_payment_data.get("amount", 0),
                        "total_tips": old_order_data.get("tip_amount", 0),
                        "total_surcharges": old_order_data.get("surcharge_amount", 0),
                        "total_collected": (
                            Decimal(old_payment_data.get("amount", 0))
                            + Decimal(old_order_data.get("tip_amount", 0))
                            + Decimal(old_order_data.get("surcharge_amount", 0))
                        ),
                        "created_at": (
                            parse_datetime(old_payment_data["created_at"])
                            if old_payment_data.get("created_at")
                            else new_order.created_at
                        ),
                        "updated_at": (
                            parse_datetime(old_payment_data["updated_at"])
                            if old_payment_data.get("updated_at")
                            else new_order.created_at
                        ),
                    },
                )

                for txn_data in old_payment_data.get("transactions", []):
                    PaymentTransaction.objects.update_or_create(
                        id=txn_data["id"],
                        payment=payment,
                        defaults={
                            "transaction_id": txn_data.get("transaction_id")
                            or f"old-txn-{txn_data['id']}",
                            "amount": txn_data.get("amount", 0),
                            "tip": old_order_data.get(
                                "tip_amount", 0
                            ),  # Tip is on the order, not transaction
                            "surcharge": old_order_data.get(
                                "surcharge_amount", 0
                            ),  # Surcharge is on the order
                            "method": PAYMENT_METHOD_MAP.get(
                                txn_data.get("payment_method"),
                                PaymentTransaction.PaymentMethod.CASH,
                            ),
                            "status": (
                                PaymentTransaction.TransactionStatus.SUCCESSFUL
                                if txn_data.get("status") in ["completed", "paid"]
                                else PaymentTransaction.TransactionStatus.FAILED
                            ),
                            "created_at": (
                                parse_datetime(txn_data["timestamp"])
                                if txn_data.get("timestamp")
                                else new_order.created_at
                            ),
                        },
                    )

        self.stdout.write(
            self.style.SUCCESS(
                f"  Processed {len(orders_data)} orders and their associated payments."
            )
        )
