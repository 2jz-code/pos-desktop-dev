import sqlite3
import os
from django.core.management.base import BaseCommand
from django.conf import settings


class Command(BaseCommand):
    help = "Exports the SQLite database schema as SQL DDL statements."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output",
            type=str,
            default="frontend_schema.sql",
            help="Output file path for the SQL schema",
        )
        parser.add_argument(
            "--include-data", action="store_true", help="Include data along with schema"
        )

    def handle(self, *args, **options):
        # Get the database path from Django settings
        db_path = settings.DATABASES["default"]["NAME"]

        if not os.path.exists(db_path):
            self.stderr.write(self.style.ERROR(f"Database file not found: {db_path}"))
            return

        output_file = options["output"]
        include_data = options["include_data"]

        try:
            # Connect to the SQLite database
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            with open(output_file, "w") as f:
                # Write header
                f.write("-- SQLite Schema Export\n")
                f.write("-- Generated from Django backend database\n\n")

                # Enable foreign keys
                f.write("PRAGMA foreign_keys = ON;\n\n")

                # Get all tables
                cursor.execute(
                    """
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name NOT LIKE 'sqlite_%'
                    ORDER BY name
                """
                )

                tables = cursor.fetchall()

                for (table_name,) in tables:
                    self.stdout.write(f"Exporting table: {table_name}")

                    # Get CREATE TABLE statement
                    cursor.execute(
                        """
                        SELECT sql FROM sqlite_master 
                        WHERE type='table' AND name=?
                    """,
                        (table_name,),
                    )

                    create_sql = cursor.fetchone()[0]
                    f.write(f"-- Table: {table_name}\n")
                    f.write(f"{create_sql};\n\n")

                # Get all indexes
                cursor.execute(
                    """
                    SELECT sql FROM sqlite_master 
                    WHERE type='index' AND sql IS NOT NULL
                    ORDER BY name
                """
                )

                indexes = cursor.fetchall()
                if indexes:
                    f.write("-- Indexes\n")
                    for (index_sql,) in indexes:
                        f.write(f"{index_sql};\n")
                    f.write("\n")

                # Include data if requested
                if include_data:
                    f.write("-- Data\n")
                    for (table_name,) in tables:
                        cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
                        count = cursor.fetchone()[0]

                        if count > 0:
                            f.write(f"-- Data for table: {table_name}\n")
                            cursor.execute(f"SELECT * FROM {table_name}")
                            rows = cursor.fetchall()

                            # Get column names
                            cursor.execute(f"PRAGMA table_info({table_name})")
                            columns = [row[1] for row in cursor.fetchall()]
                            columns_str = ", ".join(columns)

                            for row in rows:
                                # Format values for SQL
                                formatted_values = []
                                for value in row:
                                    if value is None:
                                        formatted_values.append("NULL")
                                    elif isinstance(value, str):
                                        # Escape single quotes
                                        escaped_value = value.replace("'", "''")
                                        formatted_values.append(f"'{escaped_value}'")
                                    else:
                                        formatted_values.append(str(value))

                                values_str = ", ".join(formatted_values)
                                f.write(
                                    f"INSERT INTO {table_name} ({columns_str}) VALUES ({values_str});\n"
                                )
                            f.write("\n")

            conn.close()

            self.stdout.write(
                self.style.SUCCESS(
                    f"Successfully exported SQLite schema to {output_file}"
                )
            )

        except Exception as e:
            self.stderr.write(self.style.ERROR(f"Error exporting schema: {e}"))
