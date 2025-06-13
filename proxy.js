import proxyList from './src/config.js';

const TIMEOUT = 5000;

async function checkProxy(proxy) {
  const startTime = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);
    
    const response = await fetch(proxy.url
      .replace('{{owner}}', 'FrecklyComb1728')
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

async function findFastestProxy(proxies) {
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

export default async (request, context) => {
  try {
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    
    if (!path.startsWith('/gh/')) {
      return new Response('Invalid path. Use format: /gh/owner/repo@branch/path', {
        status: 400
      });
    }

    const githubPath = path.substring(4);
    const pathParts = githubPath.split('/');
    
    if (pathParts.length < 2) {
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

    const fastestProxy = await findFastestProxy(proxyList);
    if (!fastestProxy) {
      return new Response('No available proxy found', { status: 503 });
    }

    const targetUrl = fastestProxy.url
      .replace('{{owner}}', owner)
      .replace('{{repo}}', repo)
      .replace('{{branch}}', branch)
      .replace('{{path}}', filePath);

    return Response.redirect(targetUrl, 302);
  } catch (error) {
    return new Response(`Internal Server Error: ${error.message}`, {
      status: 500
    });
  }
};
