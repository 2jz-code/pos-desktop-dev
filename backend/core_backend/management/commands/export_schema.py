# backend/core_backend/management/commands/export_schema.py
import json
from django.core.management.base import BaseCommand
from django.apps import apps
from django.db import models
from django.db.models import ForeignKey, ManyToManyField, OneToOneField


class Command(BaseCommand):
    help = "Exports the Django model schema to a JSON file."

    def handle(self, *args, **kwargs):
        self.stdout.write("Starting schema export...")
        schema = {}

        # Get all installed models
        all_models = apps.get_models()

        for model in all_models:
            app_label = model._meta.app_label
            model_name = model._meta.object_name

            # Skip irrelevant models
            if app_label in ["admin", "auth", "contenttypes", "sessions", "mptt"]:
                continue

            if app_label not in schema:
                schema[app_label] = {}

            fields = {}
            for field in model._meta.get_fields():
                # Skip reverse relations and other non-concrete fields
                if not getattr(field, "concrete", False):
                    continue

                field_info = {
                    "type": field.get_internal_type(),
                    "nullable": field.null,
                    "blank": field.blank,
                    "unique": field.unique,
                }

                if (
                    hasattr(field, "default")
                    and field.default is not models.NOT_PROVIDED
                ):
                    field_info["default"] = str(field.default)

                if hasattr(field, "choices") and field.choices:
                    field_info["choices"] = {
                        str(k): str(v) for k, v in dict(field.choices).items()
                    }

                if isinstance(field, (ForeignKey, OneToOneField)):
                    related_model = field.related_model
                    if related_model:
                        field_info["related_model"] = (
                            f"{related_model._meta.app_label}.{related_model._meta.object_name}"
                        )

                if isinstance(field, ManyToManyField):
                    related_model = field.related_model
                    if related_model:
                        field_info["related_model"] = (
                            f"{related_model._meta.app_label}.{related_model._meta.object_name}"
                        )
                        field_info["through"] = (
                            field.remote_field.through._meta.object_name
                            if field.remote_field.through
                            else None
                        )

                fields[field.name] = field_info

            schema[app_label][model_name] = {
                "fields": fields,
                "db_table": model._meta.db_table,
                "pk_field": model._meta.pk.name,
            }

        # Define the output path for the schema file
        output_file_path = "backend/schema.json"

        try:
            with open(output_file_path, "w") as f:
                json.dump(schema, f, indent=4)
            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully exported schema to {output_file_path}"
                )
            )
        except IOError as e:
            self.stderr.write(
                self.style.ERROR(f"Error writing to file {output_file_path}: {e}")
            )

        return
