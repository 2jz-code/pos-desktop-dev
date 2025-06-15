from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient
from .models import User
from .services import UserService


class UserAppCookieAuthTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.cashier = User.objects.create_user(
            email="cashier@test.com",
            username="cashier1",
            password="password123",
            role=User.Role.CASHIER,
        )
        self.cashier.set_pin("1234")

        self.manager = User.objects.create_user(
            email="manager@test.com",
            username="manager1",
            password="password123",
            role=User.Role.MANAGER,
        )
        self.owner = User.objects.create_user(
            email="owner@test.com",
            username="owner1",
            password="password123",
            role=User.Role.OWNER,
        )

    def test_pos_login_sets_cookies(self):
        url = reverse("users:login-pos")
        response = self.client.post(url, {"username": "cashier1", "pin": "1234"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("access_token", response.cookies)
        self.assertIn("refresh_token", response.cookies)
        self.assertTrue(response.cookies["access_token"]["httponly"])

    def test_user_list_denied_without_auth_cookie(self):
        url = reverse("users:list")
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_list_permission_granted_with_cookie(self):
        # 1. Log in to get the cookie
        login_url = reverse("users:login-web")
        self.client.post(
            login_url, {"email": "manager@test.com", "password": "password123"}
        )

        # 2. Make the request, which will now include the cookie
        list_url = reverse("users:list")
        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_user_list_permission_denied_for_cashier_with_cookie(self):
        login_url = reverse("users:login-web")
        self.client.post(
            login_url, {"email": "cashier@test.com", "password": "password123"}
        )
        list_url = reverse("users:list")
        response = self.client.get(list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_logout_clears_cookies(self):
        # 1. Log in
        login_url = reverse("users:login-web")
        self.client.post(
            login_url, {"email": "manager@test.com", "password": "password123"}
        )

        # 2. Log out
        logout_url = reverse("users:logout")
        response = self.client.post(logout_url)

        # 3. Check that cookies are expired
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.cookies["access_token"].value, "")
        self.assertEqual(
            response.cookies["access_token"]["expires"], "Thu, 01 Jan 1970 00:00:00 GMT"
        )
        self.assertEqual(response.cookies["refresh_token"].value, "")
        self.assertEqual(
            response.cookies["refresh_token"]["expires"],
            "Thu, 01 Jan 1970 00:00:00 GMT",
        )

    def test_set_pin_with_cookie_auth(self):
        self.client.post(
            reverse("users:login-web"),
            {"email": "manager@test.com", "password": "password123"},
        )

        url = reverse("users:set-pin")
        response = self.client.post(url, {"pin": "5678"})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.manager.refresh_from_db()
        self.assertTrue(self.manager.check_pin("5678"))
