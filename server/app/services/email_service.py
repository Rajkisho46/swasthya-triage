import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional, Dict, Any, List
from ..config import settings

logger = logging.getLogger("swasthya.email")

# In-memory development outbox for test suites and dev diagnostics
dev_outbox: List[Dict[str, Any]] = []

def get_dev_outbox() -> List[Dict[str, Any]]:
    return dev_outbox

def clear_dev_outbox() -> None:
    global dev_outbox
    dev_outbox = []

class EmailService:
    @staticmethod
    def is_smtp_configured() -> bool:
        """Check whether real SMTP server parameters are configured."""
        return bool(settings.SMTP_HOST and settings.SMTP_PORT and settings.SMTP_USERNAME and settings.SMTP_PASSWORD)

    @classmethod
    def send_email(cls, to_email: str, subject: str, text_content: str, html_content: Optional[str] = None) -> bool:
        """Dispatch email via real SMTP if configured; in automated test environment captures in dev_outbox."""
        if settings.ENVIRONMENT == "test":
            dev_outbox.append({
                "to": to_email,
                "subject": subject,
                "text": text_content,
                "html": html_content,
                "configured": cls.is_smtp_configured()
            })
            return True

        if not cls.is_smtp_configured():
            logger.error(
                f"[SWASTHYA EMAIL SERVICE] SMTP is not configured. Real email delivery to {to_email} is unavailable."
            )
            return False


        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            from_addr = settings.SMTP_FROM_EMAIL or settings.SMTP_USERNAME
            msg["From"] = f"{settings.SMTP_FROM_NAME} <{from_addr}>"
            msg["To"] = to_email

            part1 = MIMEText(text_content, "plain")
            msg.attach(part1)

            if html_content:
                part2 = MIMEText(html_content, "html")
                msg.attach(part2)

            if settings.SMTP_USE_TLS:
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12) as server:
                    server.starttls()
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.sendmail(from_addr, [to_email], msg.as_string())
            else:
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=12) as server:
                    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
                        server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                    server.sendmail(from_addr, [to_email], msg.as_string())

            dev_outbox.append({
                "to": to_email,
                "subject": subject,
                "text": text_content,
                "html": html_content,
                "configured": True
            })
            logger.info(f"[SWASTHYA EMAIL SERVICE] Verification email successfully dispatched to {to_email}")
            return True
        except Exception as err:
            logger.error(f"[SWASTHYA EMAIL SERVICE ERROR] Verification email delivery failed for recipient: {type(err).__name__}")
            return False

    @classmethod
    def send_verification_otp(cls, email: str, otp: str, full_name: Optional[str] = None) -> bool:
        """Send Email Verification OTP code for new patient registration."""
        name = full_name or "Patient"
        subject = "Swasthya Triage — Verify Your Email"
        text_content = (
            f"Hello {name},\n\n"
            f"Your Swasthya Triage verification code is:\n\n"
            f"{otp}\n\n"
            f"This code expires in {settings.OTP_EXPIRE_MINUTES} minutes.\n\n"
            f"For your security:\n"
            f"- Do not share this code with anyone.\n"
            f"- Swasthya Triage will never ask for your password.\n\n"
            f"If you did not request this account, you can ignore this email.\n\n"
            f"Regards,\n"
            f"Swasthya Triage\n"
            f"Patient Citizen Portal"
        )
        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; background: #0b192c; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #35e0c1; margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 0.05em;">Swasthya Triage</h2>
                <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Patient Portal &bull; Secure Email Verification</p>
            </div>
            <p style="font-size: 15px; color: #e2e8f0; line-height: 1.5;">Hello <strong>{name}</strong>,</p>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.5;">Your Swasthya Triage verification code is:</p>
            <div style="text-align: center; margin: 28px 0;">
                <div style="display: inline-block; padding: 14px 32px; background: rgba(53, 224, 193, 0.12); border: 2px dashed #35e0c1; border-radius: 8px; font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: #35e0c1; font-family: monospace;">
                    {otp}
                </div>
            </div>
            <p style="font-size: 13px; color: #e4cb91; line-height: 1.4;">&#9888; This code expires in <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong>.</p>
            <div style="font-size: 13px; color: #94a3b8; line-height: 1.6; margin-top: 16px; border-left: 3px solid #35e0c1; padding-left: 12px;">
                <strong>For your security:</strong><br/>
                &bull; Do not share this code with anyone.<br/>
                &bull; Swasthya Triage will never ask for your password.
            </div>
            <p style="font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px;">
                If you did not request this account, you can ignore this email.<br/><br/>
                Regards,<br/>
                <strong>Swasthya Triage</strong><br/>
                Patient Citizen Portal
            </p>
        </div>
        """
        return cls.send_email(email, subject, text_content, html_content)

    @classmethod
    def send_password_reset_otp(cls, email: str, otp: str, full_name: Optional[str] = None) -> bool:
        """Send Password Reset OTP code."""
        name = full_name or "Patient"
        subject = "SWASTHYA TRIAGE — Password Reset Code"
        text_content = (
            f"Hello {name},\n\n"
            f"A password reset request was received for your Swasthya Triage account.\n\n"
            f"Your password reset code is: {otp}\n\n"
            f"This code will expire in {settings.OTP_EXPIRE_MINUTES} minutes.\n"
            f"If you did not request a password reset, please secure your account immediately.\n\n"
            f"Institutional Healthcare Triage Network"
        )
        html_content = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; background: #0b192c; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #60a5fa; margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 0.05em;">Swasthya Triage</h2>
                <p style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Patient Portal &bull; Account Recovery</p>
            </div>
            <p style="font-size: 15px; color: #e2e8f0; line-height: 1.5;">Hello <strong>{name}</strong>,</p>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.5;">We received a request to reset your password. Use the single-use code below to complete the reset process:</p>
            <div style="text-align: center; margin: 28px 0;">
                <div style="display: inline-block; padding: 14px 32px; background: rgba(96, 165, 250, 0.12); border: 2px dashed #60a5fa; border-radius: 8px; font-size: 32px; font-weight: 800; letter-spacing: 0.25em; color: #60a5fa; font-family: monospace;">
                    {otp}
                </div>
            </div>
            <p style="font-size: 13px; color: #e4cb91; line-height: 1.4;">&#9888; This recovery code expires in <strong>{settings.OTP_EXPIRE_MINUTES} minutes</strong> and is strictly single-use.</p>
            <p style="font-size: 12px; color: #64748b; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px;">
                If you did not request a password reset, please ignore this email. Your current password remains unchanged.
            </p>
        </div>
        """
        return cls.send_email(email, subject, text_content, html_content)
