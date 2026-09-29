import nodemailer from 'nodemailer';
import { getEmailConfig, getSiteConfig } from './settings.js';
import { config } from '../config.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 邮件署名用站点名（读站点设置里的标题） */
export function mailSiteName() {
  const title = String(getSiteConfig().title || '').trim();
  return title || '壁纸集';
}

/**
 * 生成一封统一的 HTML 邮件外壳（内联样式 + table 布局，兼容 Gmail / Outlook）。
 * 提供站点名 / 顶部标题 / 正文 HTML 片段，正文用 block 写法以免被邮件客户端样式覆盖。
 */
function layout({ siteName, siteUrl, heading, subtitle, content, footerNote }) {
  const year = new Date().getFullYear();
  const safeSite = escapeHtml(siteName);
  const safeUrl = escapeHtml(siteUrl);
  const safeHeading = escapeHtml(heading);
  const safeSubtitle = escapeHtml(subtitle);
  const safeFooter = escapeHtml(footerNote);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${safeHeading} · ${safeSite}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6fb;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6fb;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #eaedf3;">
          <tr>
            <td style="background-color:#165dff;padding:28px 32px;">
              <div style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">${safeSite}</div>
              <div style="font-size:13px;color:#dbe6ff;margin-top:4px;">${safeSubtitle}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <div style="font-size:18px;font-weight:700;color:#1f2937;">${safeHeading}</div>
              <div style="font-size:14px;color:#4b5563;line-height:1.7;margin-top:16px;">${content}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 32px 32px;font-size:13px;color:#6b7280;line-height:1.7;">${safeFooter}</td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background-color:#f9fafc;border-top:1px solid #eaedf3;font-size:12px;color:#9aa3b2;line-height:1.7;">
              此邮件由系统自动发送，请勿直接回复。<br>
              如果并非你本人操作，请忽略本邮件。
            </td>
          </tr>
        </table>
        <div style="font-size:12px;color:#b6bcc7;margin-top:16px;">
          © ${year} ${safeSite} · <a href="${safeUrl}" style="color:#9aa3b2;text-decoration:none;">${safeUrl}</a>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** 主色按钮（table 结构，保证 Outlook 里可点、样式稳定） */
function button(text, url) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#165dff;border-radius:8px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(text)}</a>
    </td>
  </tr>
</table>`;
}

/** 注册邮箱验证码邮件内容 */
export function verificationEmail({ code, expiresMinutes = 10 }) {
  const siteName = mailSiteName();
  const siteUrl = config.publicBaseUrl;
  const safeCode = escapeHtml(code);

  const html = layout({
    siteName,
    siteUrl,
    heading: '您的验证码',
    subtitle: '账户安全验证',
    content: `你好，感谢使用 ${escapeHtml(siteName)}。你正在注册账号，请在有效期内输入下面的验证码完成验证：` +
      `<div style="background-color:#f0f5ff;border:1px solid #d6e4ff;border-radius:12px;text-align:center;padding:22px;margin:20px 0;">` +
      `<div style="font-size:13px;color:#165dff;letter-spacing:1px;">验证码</div>` +
      `<div style="font-size:38px;font-weight:800;letter-spacing:8px;color:#0a37ae;font-family:'SF Mono',Consolas,Menlo,monospace;margin-top:8px;">${safeCode}</div>` +
      `</div>` +
      `验证码 <strong>${expiresMinutes} 分钟</strong>内有效，请勿泄露给他人。` +
      button(`返回${siteName}`, siteUrl),
    footerNote: '如果你没有注册账号，请忽略此邮件，你的邮箱不会被使用。',
  });

  const text = `【${siteName}】你的注册验证码是 ${code}，${expiresMinutes} 分钟内有效。若非本人操作请忽略。`;

  return { subject: `【${siteName}】注册验证码`, html, text };
}

/** SMTP 测试邮件内容 */
export function testEmail() {
  const siteName = mailSiteName();
  const siteUrl = config.publicBaseUrl;

  const html = layout({
    siteName,
    siteUrl,
    heading: '邮件发送成功',
    subtitle: 'SMTP 配置测试',
    content: `这是一封测试邮件，说明你的 SMTP 配置已生效，可以正常收到来自「${escapeHtml(siteName)}」的系统邮件。` +
      button(`访问${siteName}`, siteUrl),
    footerNote: '你可以回到后台「邮箱设置」继续配置或启用邮箱验证码注册。',
  });

  const text = `【${siteName}】这是一封测试邮件，说明 SMTP 配置可用。`;

  return { subject: `【${siteName}】测试邮件`, html, text };
}

/** 重置密码邮件内容（重置链接由调用方拼好） */
export function resetPasswordEmail({ resetUrl, expiresMinutes = 15 }) {
  const siteName = mailSiteName();
  const siteUrl = config.publicBaseUrl;

  const html = layout({
    siteName,
    siteUrl,
    heading: '重置密码',
    subtitle: '账户安全',
    content: `我们收到了你的密码重置请求，请点击下面的按钮设置新密码：` +
      button('重置密码', resetUrl) +
      `如果按钮无法点击，请复制以下链接到浏览器打开：<br><span style="word-break:break-all;color:#165dff;">${escapeHtml(resetUrl)}</span>`,
    footerNote: `重置链接 ${expiresMinutes} 分钟内有效。如果你没有发起此请求，请忽略本邮件，你的密码不会被改动。`,
  });

  const text = `【${siteName}】点击链接重置密码：${resetUrl}（${expiresMinutes} 分钟内有效）。若非本人操作请忽略。`;

  return { subject: `【${siteName}】重置密码`, html, text };
}

/** 审核结果通知邮件（发给投稿人） */
export function reviewNotificationEmail({ approved, title, imageId = null, reason = '' }) {
  const siteName = mailSiteName();
  const siteUrl = config.publicBaseUrl;
  const safeTitle = escapeHtml(title || '未命名');
  const detailUrl = imageId ? `${siteUrl}/image/${imageId}` : siteUrl;

  const heading = approved ? '作品审核通过' : '作品未通过审核';
  const content = approved
    ? `你的壁纸《${safeTitle}》已通过审核，现已公开发布。` + button('查看作品', detailUrl)
    : `很抱歉，你的壁纸《${safeTitle}》未通过审核。` +
      (reason ? `原因：${escapeHtml(reason)}<br>` : '') +
      `你可以修改后重新上传。` +
      button('去上传', `${siteUrl}/upload`);

  const text = approved
    ? `【${siteName}】你的壁纸《${title || '未命名'}》已通过审核并发布。`
    : `【${siteName}】你的壁纸《${title || '未命名'}》未通过审核${reason ? `，原因：${reason}` : ''}。`;

  return {
    subject: `【${siteName}】${heading}`,
    html: layout({ siteName, siteUrl, heading, subtitle: '审核通知', content, footerNote: '此邮件由系统自动发送，请勿直接回复。' }),
    text,
  };
}

/**
 * 通过配置的 SMTP 发送邮件。未配置时抛错，调用方据此提示先去配置邮箱。
 */
export async function sendMail({ to, subject, html, text }) {
  const cfg = getEmailConfig();
  if (!cfg.host || !cfg.user) {
    throw new Error('邮箱服务未配置，请先在后台「邮箱设置」里配置 SMTP');
  }

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const from = cfg.fromEmail
    ? cfg.fromName
      ? `${cfg.fromName} <${cfg.fromEmail}>`
      : cfg.fromEmail
    : cfg.user;

  try {
    return await transport.sendMail({ from, to, subject, text, html });
  } finally {
    transport.close();
  }
}