# app/common/email.py
# AlgoFin v1 — Email delivery service via SMTP (Gmail / Custom SMTP)

import asyncio
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import smtplib

from app.config import settings

logger = logging.getLogger("algofin.email")


def _send_smtp_email(to_email: str, subject: str, html_content: str, text_content: str) -> bool:
    """Synchronous SMTP email delivery."""
    if not settings.smtp_user or not settings.smtp_password:
        logger.warning(
            f"[EMAIL MOCK] SMTP_USER/SMTP_PASSWORD not set. Email to {to_email} skipped. "
            f"Subject: {subject}"
        )
        return False

    sender = settings.smtp_from_email or settings.smtp_user

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email

    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            server.ehlo()
            if settings.smtp_port == 587:
                server.starttls()
                server.ehlo()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(sender, [to_email], msg.as_string())
        logger.info(f"Email successfully delivered to {to_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {to_email} via SMTP: {e}")
        return False


async def send_reset_code_email(to_email: str, code: str) -> bool:
    """Send 6-digit password reset code email asynchronously."""
    subject = f"Your AlgoFin Password Reset Code: {code}"

    text_content = (
        f"Hello,\n\n"
        f"Your password reset verification code for AlgoFin is: {code}\n\n"
        f"This code will expire in 15 minutes. If you did not request a password reset, "
        f"please ignore this email.\n\n"
        f"— AlgoFin Security Team"
    )

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0e14; color: #e2e8f0; margin: 0; padding: 30px 20px; }}
        .card {{ max-width: 480px; margin: 0 auto; background: #131722; border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.5); }}
        .logo {{ font-size: 20px; font-weight: 700; color: #06b6d4; margin-bottom: 24px; display: flex; align-items: center; gap: 8px; }}
        h1 {{ font-size: 20px; font-weight: 700; color: #ffffff; margin: 0 0 8px 0; }}
        p {{ font-size: 14px; color: #94a3b8; line-height: 1.5; margin: 0 0 24px 0; }}
        .code-box {{ background: #0e121b; border: 1px solid rgba(6, 182, 212, 0.3); border-radius: 12px; padding: 18px; text-align: center; margin-bottom: 24px; }}
        .code {{ font-family: 'Courier New', Courier, monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #06b6d4; margin: 0; }}
        .footer {{ font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 16px; margin-top: 24px; }}
      </style>
    </head>
    <body>
      <div className="card">
        <div className="logo">AlgoFin</div>
        <h1>Password Reset Request</h1>
        <p>Use the 6-digit verification code below to reset your AlgoFin password. This code will expire in <strong>15 minutes</strong>.</p>
        <div className="code-box">
          <div className="code">{code}</div>
        </div>
        <p style="font-size: 12px; color: #64748b;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
        <div className="footer">
          &copy; 2026 AlgoFin Trading Workspace. All rights reserved.
        </div>
      </div>
    </body>
    </html>
    """

    return await asyncio.to_thread(_send_smtp_email, to_email, subject, html_content, text_content)
