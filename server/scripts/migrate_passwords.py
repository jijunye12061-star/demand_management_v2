"""
Migrate passwords: Add password_version column to users table.
Actual SHA256→bcrypt migration happens on first login (lazy migration).
"""
import sqlite3
import sys


def migrate(db_path: str = "data/data.db"):
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Check if column already exists
    columns = [row[1] for row in cursor.execute("PRAGMA table_info(users)")]
    if "password_version" not in columns:
        cursor.execute("ALTER TABLE users ADD COLUMN password_version INTEGER DEFAULT 1")
        print(f"✅ Added password_version column (default=1 for SHA256 legacy)")
    else:
        print("ℹ️  password_version column already exists")

    conn.commit()
    conn.close()


if __name__ == "__main__":
    path = sys.argv[1] if len(sys.argv) > 1 else "data/data.db"
    migrate(path)
