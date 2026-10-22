"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSecurityEmail = exports.sendTwoFactorEmailOtp = exports.sendEmail = void 0;
const path_1 = __importDefault(require("path"));
const nodemailer_1 = __importDefault(require("nodemailer"));
const config_1 = __importDefault(require("../../config"));
// Brand logo shipped with the backend (copied from the frontend public/logo).
// Embedded inline via cid: so emails render the logo without depending on any
// public URL (works in dev, tests, and production). `dist` gets the file via
// the package.json `postbuild` copy step.
const LOGO_FILE = path_1.default.join(__dirname, '..', '..', 'assets', 'AuraTrip-Logo.png');
const LOGO_CID = 'auratrip-logo@nodemailer';
const logoAttachment = {
    filename: 'AuraTrip-Logo.png',
    path: LOGO_FILE,
    cid: LOGO_CID,
};
const getTransportConfig = () => {
    const emailUser = process.env.EMAIL_USER;
    const emailPass = process.env.EMAIL_PASS;
    if (!emailUser || !emailPass) {
        throw new Error('Email is not configured: set EMAIL_USER and EMAIL_PASS in the environment');
    }
    return {
        transporter: nodemailer_1.default.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false,
            auth: {
                user: emailUser,
                pass: emailPass,
            },
        }),
        emailUser,
    };
};
/**
 * Standard sender identity. Display name is always "Aura Trip Support".
 * The From address falls back to the authenticated SMTP account (EMAIL_USER)
 * unless EMAIL_FROM_ADDRESS is set to an address the SMTP account is
 * authorized to send as (Gmail send-as / Workspace alias). Reply-To and all
 * in-email contact points use the official Aura Trip support address.
 */
const getMailIdentity = (emailUser) => {
    const fromName = config_1.default.email_from_name || 'Aura Trip Support';
    const fromAddress = config_1.default.email_from_address || emailUser;
    return {
        from: `"${fromName}" <${fromAddress}>`,
        replyTo: config_1.default.support_email,
    };
};
const wrapTemplate = (heading, bodyHtml) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #dddddd; border-radius: 10px;">
    <div style="text-align: center; margin-bottom: 12px;">
      <img src="cid:${LOGO_CID}" alt="Aura Trip" width="170" style="display: block; margin: 0 auto; height: auto; max-width: 100%;" />
    </div>
    <h3 style="color: #333333;">${heading}</h3>
    ${bodyHtml}
    <hr style="border: 0; border-top: 1px solid #dddddd;">
    <p style="font-size: 12px; color: #aaaaaa; text-align: center;">
      If you have any issues, please contact us at ${config_1.default.support_email}.<br/>
      &copy; ${new Date().getFullYear()} Aura Trip. All rights reserved.
    </p>
  </div>
`;
/** Password-reset email (existing flow, now using the official identity). */
const sendEmail = (to, resetLink) => __awaiter(void 0, void 0, void 0, function* () {
    const { transporter, emailUser } = getTransportConfig();
    const identity = getMailIdentity(emailUser);
    const mailOptions = Object.assign(Object.assign({}, identity), { to, subject: 'Password Reset - Aura Trip', attachments: [logoAttachment], html: wrapTemplate('Reset Your Password', `
    <p style="color: #333333; font-size: 16px;">
      Hi there,
    </p>
    <p style="color: #333333; font-size: 16px;">
      We received a request to reset the password associated with your account. If you didn't request a password reset, please ignore this email.
    </p>
    <p style="color: #333333; font-size: 16px;">
      To reset your password, please click the button below:
    </p>
    <div style="text-align: center; margin: 20px 0;">
      <a href="${resetLink}" style="background-color: #2F7D62; color: white; padding: 10px 20px; text-decoration: none; font-size: 16px; border-radius: 5px;">Reset Password</a>
    </div>
    <p style="color: #333333; font-size: 16px;">
      Alternatively, you can copy and paste the following link into your browser:
    </p>
    <p style="color: #2F7D62; font-size: 16px; word-wrap: break-word;">
      ${resetLink}
    </p>
    <p style="color: #333333; font-size: 16px;">
      Thanks,<br/>
      The Aura Trip Team
    </p>
    `) });
    yield transporter.sendMail(mailOptions);
});
exports.sendEmail = sendEmail;
/**
 * Six-digit sign-in verification code (email OTP — alternative second
 * factor). The plaintext code appears only in this outgoing message; it is
 * never logged and never stored server-side (only its keyed hash is kept).
 */
const sendTwoFactorEmailOtp = (to, code) => __awaiter(void 0, void 0, void 0, function* () {
    const { transporter, emailUser } = getTransportConfig();
    const identity = getMailIdentity(emailUser);
    const mailOptions = Object.assign(Object.assign({}, identity), { to, subject: 'Your Aura Trip verification code', attachments: [logoAttachment], html: wrapTemplate('Your Verification Code', `
    <p style="color: #333333; font-size: 16px;">
      Hello,
    </p>
    <p style="color: #333333; font-size: 16px;">
      You requested a verification code to sign in to your Aura Trip account.
    </p>
    <p style="color: #333333; font-size: 28px; font-weight: bold; letter-spacing: 8px; text-align: center; margin: 24px 0;">
      ${code}
    </p>
    <p style="color: #333333; font-size: 16px;">
      This code expires in 5 minutes and can be used only once.
    </p>
    <p style="color: #333333; font-size: 16px;">
      If you did not request this code, you can ignore this email and consider
      securing your account.
    </p>
    <p style="color: #333333; font-size: 16px;">
      Aura Trip Support<br/>
      ${config_1.default.support_email}
    </p>
    `) });
    yield transporter.sendMail(mailOptions);
});
exports.sendTwoFactorEmailOtp = sendTwoFactorEmailOtp;
/**
 * Security notification (2FA changes, recovery-code regeneration, Google
 * account linking). Never includes secrets, codes, tokens or OTPs — only
 * the fact that the event happened.
 */
const sendSecurityEmail = (_a) => __awaiter(void 0, [_a], void 0, function* ({ to, subject, heading, intro, lines = [], notice, }) {
    const { transporter, emailUser } = getTransportConfig();
    const identity = getMailIdentity(emailUser);
    const linesHtml = lines
        .map((line) => `<p style="color: #333333; font-size: 16px; margin: 4px 0;">&#8226; ${line}</p>`)
        .join('');
    const noticeHtml = notice
        ? `<p style="color: #b00020; font-size: 16px; font-weight: bold;">${notice}</p>`
        : '';
    const mailOptions = Object.assign(Object.assign({}, identity), { to,
        subject, attachments: [logoAttachment], html: wrapTemplate(heading, `
    <p style="color: #333333; font-size: 16px;">Hi there,</p>
    <p style="color: #333333; font-size: 16px;">${intro}</p>
    ${linesHtml}
    ${noticeHtml}
    <p style="color: #333333; font-size: 16px;">
      Thanks,<br/>
      The Aura Trip Team
    </p>
    `) });
    yield transporter.sendMail(mailOptions);
});
exports.sendSecurityEmail = sendSecurityEmail;
