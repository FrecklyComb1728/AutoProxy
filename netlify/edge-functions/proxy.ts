import { Context } from "https://edge.netlify.com";
import { proxyList } from "../../src/config.ts";

interface ProxyConfig {
  name: string;
  url: string;
}

const TIMEOUT = 5000;

async function checkProxy(proxy: ProxyConfig): Promise<number> {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    const response = await fetch(proxy.url.replace('{{owner}}', 'FrecklyComb1728')
                                       .replace('{{repo}}', 'image-oss')
                                       .replace('{{branch}}', 'master')
                                       .replace('{{path}}', 'README.md'), {
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      return Date.now() - startTime;
    }
    return Infinity;
  } catch {
    return Infinity;
  }
}

async function findFastestProxy(proxies: ProxyConfig[]): Promise<ProxyConfig | null> {
  const results = await Promise.all(
    proxies.map(async (proxy) => ({
      proxy,
      speed: await checkProxy(proxy)
    }))
  );

  const fastest = results.reduce((fastest, current) => 
    current.speed < fastest.speed ? current : fastest
  );

  return fastest.speed === Infinity ? null : fastest.proxy;
}

export default async function handler(request: Request, context: Context): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname + url.search;
  
  if (!path.startsWith('/gh/')) {
    return new Response('Invalid path. Use format: /gh/owner/repo@branch/path', {
      status: 400
    });
  }

  const githubPath = path.substring(4);
  const fastestProxy = await findFastestProxy(proxyList);

  if (!fastestProxy) {
    return new Response('No available proxy found', { status: 503 });
  }
  // 正确解析 URL 路径
  const pathParts = githubPath.split('/');
  const [owner, repoWithBranch] = pathParts[0].split('/');
  
  // 解析仓库名和分支
  let repo: string;
  let branch: string;
  if (repoWithBranch.includes('@')) {
    [repo, branch] = repoWithBranch.split('@');
  } else {
    repo = repoWithBranch;
    branch = 'master';
  }
  
  // 获取文件路径，跳过 owner/repo 部分
  const filePath = pathParts.slice(1).join('/');

  const targetUrl = fastestProxy.url
    .replace('{{owner}}', owner)
    .replace('{{repo}}', repo)
    .replace('{{branch}}', branch)
    .replace('{{path}}', filePath);

  return Response.redirect(targetUrl, 302);
}
