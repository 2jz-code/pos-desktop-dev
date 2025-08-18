"""
Database backup management command.
Performs PostgreSQL dumps and uploads to S3 with retention management.
"""

import os
import subprocess
import tempfile
from datetime import datetime, timezone
from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
import logging

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = 'Create database backup and upload to S3 with retention management'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Show what would be done without actually doing it',
        )
        parser.add_argument(
            '--verbose',
            action='store_true',
            help='Enable verbose output',
        )

    def handle(self, *args, **options):
        self.dry_run = options['dry_run']
        self.verbose = options['verbose']
        
        if self.dry_run:
            self.stdout.write(self.style.WARNING('🔍 DRY RUN MODE - No actual backups will be created'))
        
        try:
            # Check prerequisites
            self._check_prerequisites()
            
            # Create backup
            backup_file = self._create_database_dump()
            
            if not self.dry_run:
                # Upload to S3
                s3_key = self._upload_to_s3(backup_file)
                
                # Clean up local file
                os.unlink(backup_file)
                
                # Manage retention (keep only 7 most recent)
                self._manage_retention()
                
                self.stdout.write(
                    self.style.SUCCESS(f'✅ Database backup completed: {s3_key}')
                )
            else:
                self.stdout.write(
                    self.style.SUCCESS(f'✅ DRY RUN: Would create backup and upload to S3')
                )
                
        except Exception as e:
            logger.error(f"Database backup failed: {e}")
            raise CommandError(f"Backup failed: {e}")

    def _check_prerequisites(self):
        """Check if all required settings and tools are available"""
        # Check pg_dump availability
        try:
            subprocess.run(['pg_dump', '--version'], 
                         capture_output=True, check=True)
        except (subprocess.CalledProcessError, FileNotFoundError):
            raise CommandError("pg_dump not found. Install PostgreSQL client tools.")
        
        # Check S3 configuration
        required_settings = ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
        for setting in required_settings:
            if not getattr(settings, setting, None):
                raise CommandError(f"Missing AWS configuration: {setting}")
        
        # Check backup bucket setting
        if not getattr(settings, 'AWS_BACKUP_BUCKET_NAME', None):
            raise CommandError("AWS_BACKUP_BUCKET_NAME not configured in settings")
        
        if self.verbose:
            self.stdout.write('✅ Prerequisites check passed')

    def _create_database_dump(self):
        """Create PostgreSQL dump file"""
        # Generate timestamp-based filename
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
        filename = f"pos_backup_{timestamp}.dump"
        
        # Create temporary file
        temp_dir = tempfile.gettempdir()
        backup_file = os.path.join(temp_dir, filename)
        
        if self.dry_run:
            self.stdout.write(f'🔍 Would create backup: {backup_file}')
            return backup_file
        
        # Build pg_dump command
        db_url = settings.DATABASES['default']
        
        env = os.environ.copy()
        env['PGPASSWORD'] = db_url['PASSWORD']
        
        cmd = [
            'pg_dump',
            '--host', db_url['HOST'],
            '--port', str(db_url['PORT']),
            '--username', db_url['USER'],
            '--dbname', db_url['NAME'],
            '--no-password',
            '--verbose',
            '--format=custom',     # Custom format (.dump)
            '--compress=9',        # Maximum compression
            '--clean',             # Add DROP statements
            '--if-exists',         # Don't error if objects don't exist
            '--create',            # Include CREATE DATABASE statement
            '--blobs',             # Include large objects
            '--no-privileges',     # Don't dump privileges (cleaner for restore)
            '--no-owner',          # Don't dump ownership commands
            '--file', backup_file
        ]
        
        if self.verbose:
            self.stdout.write(f'🔄 Creating database dump...')
            
        try:
            result = subprocess.run(cmd, env=env, capture_output=True, text=True)
            if result.returncode != 0:
                raise CommandError(f"pg_dump failed: {result.stderr}")
                
            # Verify file was created and has content
            if not os.path.exists(backup_file) or os.path.getsize(backup_file) == 0:
                raise CommandError("Backup file was not created or is empty")
                
            file_size = os.path.getsize(backup_file) / (1024 * 1024)  # MB
            self.stdout.write(f'✅ Database dump created: {filename} ({file_size:.1f}MB)')
            
            return backup_file
            
        except Exception as e:
            # Clean up on failure
            if os.path.exists(backup_file):
                os.unlink(backup_file)
            raise CommandError(f"Failed to create database dump: {e}")

    def _upload_to_s3(self, backup_file):
        """Upload backup file to S3"""
        try:
            import boto3
            from botocore.exceptions import ClientError
        except ImportError:
            raise CommandError("boto3 not installed. Run: pip install boto3")
        
        filename = os.path.basename(backup_file)
        s3_key = f"database-backups/{filename}"
        
        if self.verbose:
            self.stdout.write(f'🔄 Uploading to S3: {s3_key}')
        
        try:
            s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1')
            )
            
            # Upload with metadata
            s3_client.upload_file(
                backup_file,
                settings.AWS_BACKUP_BUCKET_NAME,
                s3_key,
                ExtraArgs={
                    'Metadata': {
                        'backup-type': 'postgresql',
                        'database-name': settings.DATABASES['default']['NAME'],
                        'created-at': datetime.now(timezone.utc).isoformat(),
                        'backup-version': '1.0'
                    }
                }
            )
            
            self.stdout.write(f'✅ Uploaded to S3: s3://{settings.AWS_BACKUP_BUCKET_NAME}/{s3_key}')
            return s3_key
            
        except ClientError as e:
            raise CommandError(f"S3 upload failed: {e}")

    def _manage_retention(self):
        """Keep only the 7 most recent backups"""
        try:
            import boto3
            from botocore.exceptions import ClientError
        except ImportError:
            return  # Already checked in upload
        
        if self.verbose:
            self.stdout.write('🔄 Managing backup retention...')
        
        try:
            s3_client = boto3.client(
                's3',
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=getattr(settings, 'AWS_S3_REGION_NAME', 'us-east-1')
            )
            
            # List all backup files
            response = s3_client.list_objects_v2(
                Bucket=settings.AWS_BACKUP_BUCKET_NAME,
                Prefix='database-backups/',
                Delimiter='/'
            )
            
            if 'Contents' not in response:
                return  # No backups to manage
            
            # Sort by last modified (newest first)
            backups = sorted(
                response['Contents'],
                key=lambda x: x['LastModified'],
                reverse=True
            )
            
            # Keep only the 7 most recent, delete the rest
            to_delete = backups[7:]  # Everything after the 7th item
            
            if to_delete:
                delete_keys = [{'Key': obj['Key']} for obj in to_delete]
                
                s3_client.delete_objects(
                    Bucket=settings.AWS_BACKUP_BUCKET_NAME,
                    Delete={'Objects': delete_keys}
                )
                
                self.stdout.write(
                    f'🗑️  Cleaned up {len(to_delete)} old backup(s) (retention: 7 days)'
                )
            else:
                if self.verbose:
                    self.stdout.write(f'📦 Retention OK: {len(backups)} backup(s) (max: 7)')
                    
        except ClientError as e:
            # Don't fail the whole backup for retention issues
            logger.warning(f"Retention management failed: {e}")
            self.stdout.write(
                self.style.WARNING(f'⚠️  Retention cleanup failed: {e}')
            )