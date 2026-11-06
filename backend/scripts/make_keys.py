"""Prints fresh secret keys for a deployment. Run:  python3 backend/scripts_make_keys.py"""
import base64
import secrets

print("SECRET_KEY=" + secrets.token_urlsafe(48))
print("DATA_ENCRYPTION_KEY=" + base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())
print()
print("Save DATA_ENCRYPTION_KEY somewhere safe. Without it, stored messages and photos cannot be read.")
