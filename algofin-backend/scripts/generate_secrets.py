#!/usr/bin/env python3
"""
AlgoFin v1 — Secret key generator
Run this ONCE to generate the required environment secrets.

Usage:
    python scripts/generate_secrets.py

Then paste the output into your .env file.
"""

import base64
import os
import secrets


def generate_secret_key() -> str:
    """Generate a 32-byte hex secret key for JWT signing."""
    return secrets.token_hex(32)


def generate_fernet_key() -> str:
    """
    Generate a Fernet key for AES-256-CBC credential encryption.
    Must be a 32-byte URL-safe base64-encoded key.
    """
    try:
        from cryptography.fernet import Fernet
        return Fernet.generate_key().decode()
    except ImportError:
        # If cryptography not installed, generate the key bytes manually
        raw = secrets.token_bytes(32)
        return base64.urlsafe_b64encode(raw).decode()


def main() -> None:
    print("=" * 60)
    print("AlgoFin — Generated Secrets")
    print("Copy these into your .env file.")
    print("=" * 60)
    print()
    print(f"SECRET_KEY={generate_secret_key()}")
    print()
    print(f"FERNET_KEY={generate_fernet_key()}")
    print()
    print("=" * 60)
    print("⚠️  NEVER commit these values to git.")
    print("⚠️  Keep FERNET_KEY safe — losing it makes credentials unrecoverable.")
    print("=" * 60)


if __name__ == "__main__":
    main()
