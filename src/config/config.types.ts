export interface DomainEntry {
  domain: string;
  /** 带 DuckMail API Key 时仅返回 isVerified 为 true 的域名 */
  isVerified: boolean;
  isActive: boolean;
  isPrivate: boolean;
}

export interface MailServiceConfig {
  /** DuckMail 兼容 API 的管理密钥，形如 dk_xxx；与注册机 DUCKMAIL_KEY 一致 */
  duckmailApiKey: string;
  httpPort: number;
  /** 入站 SMTP 监听端口（容器内需映射到主机或对接 MX） */
  smtpPort: number;
  /** 签发邮箱 JWT */
  jwtSecret: string;
  jwtExpiresIn: string;
  /** 对外声明的域名列表（MX 需指向本机 SMTP） */
  domains: DomainEntry[];
}
