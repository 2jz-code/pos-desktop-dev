from django import forms
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from django.utils.translation import gettext_lazy as _
from .models import User


class UserAdminCreationForm(forms.ModelForm):
    password = forms.CharField(label=_("Password"), widget=forms.PasswordInput)
    password2 = forms.CharField(
        label=_("Password confirmation"), widget=forms.PasswordInput
    )
    pin = forms.CharField(
        label=_("Initial PIN"),
        widget=forms.PasswordInput,
        required=False,
        help_text=_("Set an initial 4-6 digit PIN for POS access. Can be left blank."),
    )

    class Meta:
        model = User
        fields = ("email", "username", "role")

    def clean_password2(self):
        cd = self.cleaned_data
        if cd["password"] != cd["password2"]:
            raise forms.ValidationError(_("Passwords don't match."))
        return cd["password2"]

    def save(self, commit=True):
        user = super().save(commit=False)
        user.set_password(self.cleaned_data["password"])
        if self.cleaned_data.get("pin"):
            user.set_pin(self.cleaned_data["pin"])
        if commit:
            user.save()
        return user


class UserAdminChangeForm(forms.ModelForm):
    password = ReadOnlyPasswordHashField(
        label=_("Password"),
        help_text=_(
            "Raw passwords are not stored, so there is no way to see this "
            "user's password, but you can change the password using "
            '<a href="../password/">this form</a>.'
        ),
    )
    pin = forms.CharField(
        label=_("Set/Change PIN"),
        widget=forms.PasswordInput,
        required=False,
        help_text=_(
            "Enter a new 4-6 digit PIN to set or change it. Leave blank to make no changes."
        ),
    )

    class Meta:
        model = User
        fields = "__all__"

    def clean_password(self):
        # Regardless of what the user provides, return the initial value.
        # This is prevents the password from being changed unless the separate
        # form is used.
        return self.initial["password"]

    def save(self, commit=True):
        user = super().save(commit=False)
        if self.cleaned_data.get("pin"):
            user.set_pin(self.cleaned_data["pin"])
        if commit:
            user.save()
        return user
