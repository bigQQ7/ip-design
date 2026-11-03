// 在 Supabase 后台 → Project Settings → API 里找到这两个值，填进来。
// 这两个值本来就是公开给网页用的，可以放进 GitHub；真正的权限由数据库规则控制。
// 不要把 service_role（服务端密钥）或任何密码放进这个文件。
window.APP_CONFIG = {
  SUPABASE_URL: "https://你的项目ID.supabase.co",
  SUPABASE_ANON_KEY: "你的 anon public key"
};
