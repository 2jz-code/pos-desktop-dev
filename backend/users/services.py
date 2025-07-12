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

    @staticmethod
    def set_auth_cookies(response, access_token, refresh_token):
        """
        Set authentication cookies for staff/admin users.
        """
        is_secure = True  # FORCE SECURE FOR SAMESITE=NONE
        samesite_policy = "None"  # FORCE SAMESITE=NONE

        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE"],
            value=access_token,
            max_age=settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds(),
            path="/",
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )
        response.set_cookie(
            key=settings.SIMPLE_JWT["AUTH_COOKIE_REFRESH"],
            value=refresh_token,
            max_age=settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds(),
            path="/",
            httponly=True,
            secure=is_secure,
            samesite=samesite_policy,
        )
