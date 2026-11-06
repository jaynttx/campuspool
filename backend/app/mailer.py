"""Sends the sign-in code by email.

Production needs SMTP_* variables. In development, with no SMTP configured, the code is
written to the server console instead so you can test without a mail account.
"""

import logging
import smtplib
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


def deliver_otp(email: str, code: str) -> str:
    """Returns how the code was delivered: 'email' or 'console'."""
    subject = "Your CampusPool sign-in code"
    body = (
        f"Your CampusPool code is {code}.\n\n"
        f"It expires in {settings.otp_ttl_minutes} minutes. If you did not ask for it, you can ignore this email.\n"
    )
    if settings.smtp_host:
        _send_smtp(email, subject, body)
        return "email"
    if settings.environment == "development":
        log.warning("DEVELOPMENT ONLY: sign-in code for %s is %s", email, code)
        return "console"
    raise MailError("Email delivery is not configured on this server.")


def send_notification_email(email: str, subject: str, body: str) -> str:
    """Reminder emails. Same delivery rules as sign-in codes: SMTP when configured, console in development, otherwise skipped."""
    if settings.smtp_host:
        _send_smtp(email, subject, body)
        return "email"
    if settings.environment == "development":
        log.warning("DEVELOPMENT ONLY: email to %s | %s | %s", email, subject, body.replace("\n", " "))
        return "console"
    raise MailError("Email delivery is not configured on this server.")
