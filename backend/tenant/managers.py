from django.db import models
from threading import local

# Thread-local storage for current tenant
_thread_locals = local()


def set_current_tenant(tenant):
    """
    Set the current tenant for this thread.

    Args:
        tenant: Tenant instance or None to clear

    This is called by TenantMiddleware and Celery tasks to establish
    tenant context for the current request/task.
    """
    _thread_locals.tenant = tenant


def get_current_tenant():
    """
    Get the current tenant for this thread.

    Returns:
        Tenant instance or None if no tenant context is set
    """
    return getattr(_thread_locals, 'tenant', None)


class TenantManager(models.Manager):
    """
    Automatically filters querysets by current tenant.

    FAILS CLOSED: Returns empty queryset if no tenant context is set.
    This prevents accidental data leakage across tenants.

    Usage:
        class Product(models.Model):
            tenant = models.ForeignKey('tenant.Tenant', on_delete=models.CASCADE)
            name = models.CharField(max_length=255)

            objects = TenantManager()  # Default manager (tenant-filtered)
            all_objects = models.Manager()  # Bypass filter for admin operations

        # In view:
        products = Product.objects.all()  # Automatically filtered by request.tenant

        # In admin/script (need unfiltered access):
        all_products = Product.all_objects.all()  # Unfiltered
    """

    def get_queryset(self):
        """
        Return queryset filtered by current tenant.

        If no tenant context is set, returns empty queryset (fail-closed).
        """
        tenant = get_current_tenant()

        if tenant:
            return super().get_queryset().filter(tenant=tenant)

        # FAIL CLOSED: Return empty queryset if no tenant context
        # This prevents accidental exposure of all tenant data
        return super().get_queryset().none()


class TenantSoftDeleteManager(models.Manager):
    """
    Combined manager for models with BOTH multi-tenancy AND soft delete.

    Provides:
    - Tenant filtering (from TenantManager)
    - Soft delete methods: active(), with_archived(), archived_only()

    Usage:
        class Product(SoftDeleteMixin):
            tenant = models.ForeignKey('tenant.Tenant', on_delete=models.CASCADE)
            name = models.CharField(max_length=255)

            objects = TenantSoftDeleteManager()  # Tenant-filtered + active only
            all_objects = models.Manager()  # Bypass all filters
    """

    def get_queryset(self):
        """Return tenant-filtered queryset with soft delete support (active only by default)."""
        from core_backend.utils.archiving import SoftDeleteQuerySet

        qs = SoftDeleteQuerySet(self.model, using=self._db)

        tenant = get_current_tenant()
        if tenant:
            qs = qs.filter(tenant=tenant)
        else:
            # FAIL CLOSED: Return empty queryset if no tenant context
            qs = qs.none()

        # Apply soft delete filtering (active only by default)
        return qs.active()

    def active(self):
        """Return only active (non-archived) records for current tenant."""
        return self.get_queryset()

    def with_archived(self):
        """Return both active and archived records for current tenant."""
        from core_backend.utils.archiving import SoftDeleteQuerySet

        qs = SoftDeleteQuerySet(self.model, using=self._db)

        tenant = get_current_tenant()
        if tenant:
            return qs.filter(tenant=tenant)
        else:
            return qs.none()

    def archived_only(self):
        """Return only archived records for current tenant."""
        from core_backend.utils.archiving import SoftDeleteQuerySet

        qs = SoftDeleteQuerySet(self.model, using=self._db)

        tenant = get_current_tenant()
        if tenant:
            return qs.filter(tenant=tenant).archived()
        else:
            return qs.none()


class TenantAwareUserManager(models.Manager):
    """
    Combined manager for User model with multi-tenancy, soft delete, AND auth methods.

    Provides:
    - Tenant filtering (from TenantManager)
    - Soft delete methods: active(), with_archived(), archived_only()
    - Auth methods: create_user(), create_superuser(), get_by_natural_key()

    This manager is specifically designed for the User model which needs all three capabilities.

    Usage:
        class User(SoftDeleteMixin, AbstractBaseUser):
            tenant = models.ForeignKey('tenant.Tenant', on_delete=models.CASCADE)

            objects = TenantAwareUserManager()  # Default manager with all capabilities
            all_objects = models.Manager()  # Bypass all filters (admin only)
    """

    def get_queryset(self):
        """
        Return tenant-filtered queryset with soft delete support (active only by default).

        IMPORTANT: Unlike other models, User does NOT fail-closed when no tenant context.
        This is necessary for:
        - Django admin authentication (no tenant context during login)
        - Session-based user loading (middleware loads user before tenant is set)
        - Staff/superuser operations across all tenants

        Security is still maintained through:
        - Database-level unique constraints (tenant + email)
        - Admin permissions and access controls
        - Tenant middleware filtering API requests
        """
        from core_backend.utils.archiving import SoftDeleteQuerySet

        qs = SoftDeleteQuerySet(self.model, using=self._db)

        tenant = get_current_tenant()
        if tenant:
            # Filter by tenant when context is available
            qs = qs.filter(tenant=tenant)
        # NOTE: No else clause - returns all users when no tenant context
        # This allows admin login and cross-tenant staff operations

        # Apply soft delete filtering (active only by default)
        return qs.active()

    def active(self):
        """Return only active (non-archived) users for current tenant (or all if no tenant context)."""
        return self.get_queryset()

    def with_archived(self):
        """Return both active and archived users for current tenant (or all if no tenant context)."""
        from core_backend.utils.archiving import SoftDeleteQuerySet

        qs = SoftDeleteQuerySet(self.model, using=self._db)

        tenant = get_current_tenant()
        if tenant:
            return qs.filter(tenant=tenant)
        # Returns all users when no tenant context (for admin)
        return qs

    def archived_only(self):
        """Return only archived users for current tenant (or all archived if no tenant context)."""
        from core_backend.utils.archiving import SoftDeleteQuerySet

        qs = SoftDeleteQuerySet(self.model, using=self._db)

        tenant = get_current_tenant()
        if tenant:
            return qs.filter(tenant=tenant).archived()
        # Returns all archived users when no tenant context (for admin)
        return qs.archived()

    def get_by_natural_key(self, username):
        """
        Get user by natural key (email in our case).

        IMPORTANT: This method is called by Django's authentication system WITHOUT
        tenant context, so we need to search across all tenants.
        """
        # Use all_objects to bypass tenant filtering for authentication
        return self.model.all_objects.get(**{self.model.USERNAME_FIELD: username})

    def _create_user(self, email, password, **extra_fields):
        """Create and save a user with the given email and password."""
        if not email:
            from django.utils.translation import gettext_lazy as _
            raise ValueError(_("The Email must be set"))

        from django.contrib.auth.models import BaseUserManager
        email = BaseUserManager.normalize_email(email)

        user = self.model(email=email, **extra_fields)
        user.set_password(password)

        # Automatically set is_pos_staff for all staff roles
        if hasattr(self.model, 'Role'):
            role = extra_fields.get("role", self.model.Role.CASHIER)
            user.is_pos_staff = True

        user.save(using=self._db)
        return user

    def create_user(self, email, password=None, **extra_fields):
        """Create and save a regular user."""
        extra_fields.setdefault("is_staff", False)
        extra_fields.setdefault("is_superuser", False)
        return self._create_user(email, password, **extra_fields)

    def create_superuser(self, email, password, **extra_fields):
        """Create and save a superuser."""
        extra_fields.setdefault("is_staff", True)
        extra_fields.setdefault("is_superuser", True)
        extra_fields.setdefault("is_active", True)

        if hasattr(self.model, 'Role'):
            extra_fields.setdefault("role", self.model.Role.OWNER)

        if extra_fields.get("is_staff") is not True:
            from django.utils.translation import gettext_lazy as _
            raise ValueError(_("Superuser must have is_staff=True."))
        if extra_fields.get("is_superuser") is not True:
            from django.utils.translation import gettext_lazy as _
            raise ValueError(_("Superuser must have is_superuser=True."))

        return self._create_user(email, password, **extra_fields)
