import { serve } from "std/http/server.ts";
import { proxyList } from "./config.ts";

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

async function handler(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    
    console.log(`Processing request for path: ${path}`);
    
    if (!path.startsWith('/gh/')) {
      console.log('Invalid path format');
      return new Response('Invalid path. Use format: /gh/owner/repo@branch/path', {
        status: 400
      });
    }

    const githubPath = path.substring(4);
    console.log(`GitHub path: ${githubPath}`);

    const pathParts = githubPath.split('/');
    
    // 必须至少有 owner/repo 和文件路径部分
    if (pathParts.length < 2) {
      console.log('Invalid path structure');
      return new Response('Invalid path structure. Use: owner/repo@branch/path', {
        status: 400
      });
    }

    // 解析所有者和仓库信息
    const ownerPart = pathParts[0];
    let owner = ownerPart;
    let repo = pathParts[1];
    let branch = 'master';

    // 处理可能包含分支名的仓库部分
    if (repo.includes('@')) {
      const [repoName, branchName] = repo.split('@');
      repo = repoName;
      branch = branchName;
    }

    // 获取文件路径（跳过 owner 和 repo 部分）
    const filePath = pathParts.slice(2).join('/');

    console.log(`Parsed path - owner: ${owner}, repo: ${repo}, branch: ${branch}, path: ${filePath}`);

    const fastestProxy = await findFastestProxy(proxyList);
    if (!fastestProxy) {
      console.log('No available proxy found');
      return new Response('No available proxy found', { status: 503 });
    }

    const targetUrl = fastestProxy.url
      .replace('{{owner}}', owner)
      .replace('{{repo}}', repo)
      .replace('{{branch}}', branch)
      .replace('{{path}}', filePath);

    console.log(`Redirecting to: ${targetUrl}`);
    return Response.redirect(targetUrl, 302);  } catch (error: unknown) {
    console.error('Error processing request:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(`Internal Server Error: ${errorMessage}`, {
      status: 500
    });
  }
}

// Deno server
serve(handler, { port: 8000 });
