from django.conf import settings
from rest_framework_simplejwt.tokens import RefreshToken
from .models import User


class UserService:
    @staticmethod
    def authenticate_pos_user(username: str, pin: str) -> User | None:
        try:
            user = User.objects.get(
                username__iexact=username,
                role__in=[
                    User.Role.CASHIER,
                    User.Role.MANAGER,
                    User.Role.ADMIN,
                    User.Role.OWNER,
                ],
            )
            if user.check_pin(pin):
                return user
        except User.DoesNotExist:
            return None
        return None

    @staticmethod
    def generate_tokens_for_user(user: User) -> dict:
        refresh = RefreshToken.for_user(user)
        return {
            "refresh": str(refresh),
            "access": str(refresh.access_token),
        }
