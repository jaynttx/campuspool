"""Sends the sign-in code by email.

Two ways to send, checked in this order:
  1. BREVO_API_KEY + MAIL_FROM_EMAIL: Brevo's HTTPS API (works on hosts that block SMTP ports, like free Render).
  2. SMTP_HOST and the other SMTP_* variables.
In development, with neither configured, the code is written to the server console instead.
"""

import json
import logging
import smtplib
import urllib.error
import urllib.request
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("campuspool")


class MailError(Exception):
    pass


def _send_smtp(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"] = settings.smtp_from or settings.smtp_user or "no-reply@localhost"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            if settings.smtp_starttls:
                smtp.starttls()
            if settings.smtp_user and settings.smtp_password:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except Exception as exc:  # network, auth or TLS problems
        log.error("SMTP delivery failed: %s", exc)
        raise MailError("Could not send the email. Try again in a moment.") from exc


def _send_brevo(to: str, subject: str, body: str) -> None:
    payload = {
        "sender": {"name": settings.mail_from_name, "email": settings.mail_from_email},
        "to": [{"email": to}],
        "subject": subject,
        "textContent": body,
    }
    req = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(payload).encode(),
        headers={"api-key": settings.brevo_api_key or "", "content-type": "application/json", "accept": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            if res.status >= 300:
                raise MailError(f"Brevo answered {res.status}")
    except urllib.error.HTTPError as exc:
        log.error("Brevo delivery failed: %s %s", exc.code, exc.read()[:300])
        raise MailError("Could not send the email. Try again in a moment.") from exc
    except Exception as exc:  # network problems
        log.error("Brevo delivery failed: %s", exc)
        raise MailError("Could not send the email. Try again in a moment.") from exc


def _send(to: str, subject: str, body: str) -> bool:
    """True when a real email was sent."""
    if settings.brevo_api_key and settings.mail_from_email:
        _send_brevo(to, subject, body)
        return True
    if settings.smtp_host:
        _send_smtp(to, subject, body)
        return True
    return False


def deliver_otp(email: str, code: str) -> str:
    """Returns how the code was delivered: 'email' or 'console'."""
    subject = "Your CampusPool sign-in code"
    body = (
        f"Your CampusPool code is {code}.\n\n"
        f"It expires in {settings.otp_ttl_minutes} minutes. If you did not ask for it, you can ignore this email.\n"
    )
    if _send(email, subject, body):
        return "email"
    if settings.environment == "development":
        log.warning("DEVELOPMENT ONLY: sign-in code for %s is %s", email, code)
        return "console"
    raise MailError("Email delivery is not configured on this server.")


def send_notification_email(email: str, subject: str, body: str) -> str:
    """Reminder emails. Same delivery rules as sign-in codes: Brevo or SMTP when configured, console in development."""
    if _send(email, subject, body):
        return "email"
    if settings.environment == "development":
        log.warning("DEVELOPMENT ONLY: email to %s | %s | %s", email, subject, body.replace("\n", " "))
        return "console"
    raise MailError("Email delivery is not configured on this server.")
