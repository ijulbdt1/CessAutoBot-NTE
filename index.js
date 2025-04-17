// Railway-ready CESS Auto Daily Checkin & Upload Files by NT Exhaust

import axios from 'axios';
import cfonts from 'cfonts';
import chalk from 'chalk';
import ora from 'ora';
import FormData from 'form-data';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

const delay = (seconds) => new Promise((res) => setTimeout(res, seconds * 1000));

const userAgents = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, seperti Gecko) Chrome/134.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, seperti Gecko) Version/15.1 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, seperti Gecko) Chrome/105.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, seperti Gecko) Firefox/102.0'
];

const getRandomUserAgent = () => userAgents[Math.floor(Math.random() * userAgents.length)];

const getHeaders = (token = null, isMultipart = false) => {
  const headers = {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'application/json, text/plain, */*',
    ...(isMultipart ? {} : { 'Content-Type': 'application/json' }),
    'Origin': 'https://cess.network',
    'Referer': 'https://cess.network/'
  };
  if (token) headers['token'] = token;
  return headers;
};

const newAgent = (proxy) => {
  if (proxy.startsWith('http://') || proxy.startsWith('https://')) return new HttpsProxyAgent(proxy);
  if (proxy.startsWith('socks4://') || proxy.startsWith('socks5://')) return new SocksProxyAgent(proxy);
  return null;
};

const getAxiosConfig = (proxy, token = null, isMultipart = false) => {
  const config = {
    headers: getHeaders(token, isMultipart),
    timeout: 60000,
  };
  if (proxy) {
    config.httpsAgent = newAgent(proxy);
    config.proxy = false;
  }
  return config;
};

const requestWithRetry = async (method, url, payload = null, config = {}, retries = 3, backoff = 2000) => {
  for (let i = 0; i < retries; i++) {
    try {
      let response = method.toLowerCase() === 'get'
        ? await axios.get(url, config)
        : await axios.post(url, payload, config);
      return response;
    } catch (error) {
      if (i < retries - 1) {
        await delay(backoff / 1000);
        backoff *= 1.5;
        continue;
      }
      throw error;
    }
  }
};

const getPublicIP = async (proxy) => {
  try {
    const res = await requestWithRetry('get', 'https://api.ipify.org?format=json', null, getAxiosConfig(proxy));
    return res?.data?.ip || 'Unknown';
  } catch {
    return 'Error';
  }
};

const tokens = process.env.TOKENS?.split(',').map(t => t.trim()).filter(Boolean) || [];
const useProxy = process.env.USE_PROXY === 'true';
const proxies = process.env.PROXIES?.split(',').map(p => p.trim()).filter(Boolean) || [];

const processToken = async (token, index, total, proxy = null) => {
  console.log(`\n================ Account ${index + 1}/${total} ================`);
  try {
    const statusRes = await requestWithRetry('get', 'https://merklev2.cess.network/merkle/task/status', null, getAxiosConfig(proxy, token));
    const acc = statusRes.data.data.account;
    console.log(`Username: ${acc.username}`);
    console.log(`UUID    : ${acc.uuid}`);
    console.log(`Wallet  : ${acc.account}`);
    console.log(`IP      : ${await getPublicIP(proxy)}`);

    const checkinRes = await requestWithRetry('post', 'https://merklev2.cess.network/merkle/task/checkin', {}, getAxiosConfig(proxy, token));
    console.log(`Checkin : ${checkinRes.data.data || 'FAILED'}`);

    for (let i = 0; i < 3; i++) {
      const seed = Math.floor(Math.random() * 100000);
      const imageUrl = `https://picsum.photos/seed/${seed}/500/500`;
      const imgBuffer = (await axios.get(imageUrl, { responseType: 'arraybuffer' })).data;
      const form = new FormData();
      const filename = `img_${Date.now()}_${seed}.png`;

      form.append('file', imgBuffer, { filename, contentType: 'image/png' });
      form.append('user_uuid', acc.uuid);
      form.append('output', 'json2');
      form.append('filename', filename);
      form.append('user_wallet', acc.account);

      const uploadConfig = {
        headers: {
          ...form.getHeaders(),
          'User-Agent': getRandomUserAgent(),
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://cess.network',
          'Referer': 'https://cess.network/'
        },
        timeout: 60000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity
      };
      if (proxy) {
        uploadConfig.httpsAgent = newAgent(proxy);
        uploadConfig.proxy = false;
      }

      const uploadRes = await axios.post('https://filepool.cess.network/group1/upload', form, uploadConfig);
      console.log(`Upload ${i + 1}/3: ${uploadRes.data?.status === 'ok' ? 'Success' : 'Failed'}`);
      await delay(1);
    }

    const finalPoints = (await requestWithRetry('get', 'https://merklev2.cess.network/merkle/task/status', null, getAxiosConfig(proxy, token))).data.data.account.points;
    console.log(`Points  : ${finalPoints}`);
  } catch (err) {
    console.error(`Error akun ${index + 1}:`, err.message);
  }
};

const run = async () => {
  cfonts.say('NT EXHAUST', { font: 'block', align: 'center', colors: ['cyan', 'magenta'] });
  console.log('== CESS AUTO DAILY CHECKIN & UPLOAD FILES ==\n');

  for (let i = 0; i < tokens.length; i++) {
    const proxy = useProxy ? proxies[i % proxies.length] : null;
    await processToken(tokens[i], i, tokens.length, proxy);
  }

  console.log('All accounts processed. Sleeping for 24h...');
  await delay(86400);
  run();
};

run();
