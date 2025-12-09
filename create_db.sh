#!/usr/bin/env bash

mkdir -p dist
sqlite3 blue.db <<EOF
CREATE TABLE IF NOT EXISTS followers (
    did TEXT PRIMARY KEY NOT NULL,
    handle TEXT NOT NULL,
    displayName TEXT NULL,
    avatar TEXT NULL,
    updated NUMBER NOT NULL DEFAULT 1,
    created TEXT NOT NULL DEFAULT (DATETIME('now'))
);
EOF

echo "Database 'blue.db' created successfully."
