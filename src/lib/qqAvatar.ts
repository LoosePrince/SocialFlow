/** QQ 官方头像 CDN（nk 为 uin） */
export function qqAvatarUrl(uin: string): string {
  return `https://q1.qlogo.cn/g?b=qq&nk=${uin}&s=640`;
}
