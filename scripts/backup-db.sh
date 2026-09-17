#!/usr/bin/env bash
# ==============================================================================
# Automated Database Backup Script for Grocery POS
# Compresses SQLite database and retains 30 daily archives
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${HOME}/pos_backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/pos_backup_${TIMESTAMP}.sqlite.gz"

mkdir -p "${BACKUP_DIR}"

echo "Extracting database from Docker container volume..."
docker run --rm \
  -v grocerystore_pos_data:/data:ro \
  alpine sh -c "gzip -c /data/grocery_pos.sqlite" > "${BACKUP_FILE}"

echo "Backup created at: ${BACKUP_FILE}"

# Retention: Delete backups older than 30 days
find "${BACKUP_DIR}" -type f -name "*.sqlite.gz" -mtime +30 -delete
echo "Old archives cleaned up. Backup complete."
