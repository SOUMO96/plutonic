import { mkdir, writeFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = process.cwd();
const publicDir = join(root, 'public', 'media');
const fileName = 'Black_Hole_with_Accretion_Disk_Visualization_(SVS14619_-_3-Pulling_back_from_a_black_hole-4K).webm';
const fileTitle = 'File:' + fileName;
const api = new URL('https://commons.wikimedia.org/w/api.php');
api.searchParams.set('action', 'query');
api.searchParams.set('format', 'json');
api.searchParams.set('prop', 'videoinfo');
api.searchParams.set('viprop', 'derivatives|mediatype');
api.searchParams.set('titles', fileTitle);

const headers = {
  'User-Agent': 'PLUTONIC-Cinematic-Storefront/1.0 (video optimization build)',
  'Accept': 'application/json'
};

async function download(url, destination) {
  const response = await fetch(url, { headers: { 'User-Agent': headers['User-Agent'] } });
  if (!response.ok || !response.body) {
    throw new Error('Media download failed (' + response.status + ') for ' + url);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100_000) {
    throw new Error('Media response was unexpectedly small (' + bytes.length + ' bytes)');
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return bytes.length;
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  const apiResponse = await fetch(api, { headers });
  if (!apiResponse.ok) {
    throw new Error('Wikimedia derivative API returned HTTP ' + apiResponse.status);
  }
  const payload = await apiResponse.json();
  const page = Object.values(payload?.query?.pages ?? {})[0];
  const info = page?.videoinfo?.[0];
  const derivatives = info?.derivatives ?? [];

  const webm = derivatives.filter((item) =>
    String(item.type ?? '').toLowerCase().includes('webm') &&
    /vp9/i.test(String(item.type ?? '') + ' ' + String(item.transcodekey ?? ''))
  );
  const choose = (targetWidth) => webm
    .filter((item) => Number(item.width) <= targetWidth && Number(item.width) >= targetWidth * .9)
    .sort((a, b) => Number(b.width) - Number(a.width))[0]
    ?? webm.filter((item) => Number(item.width) <= targetWidth)
      .sort((a, b) => Number(b.width) - Number(a.width))[0];

  const desktop = choose(1920);
  const mobile = choose(1280);
  if (!desktop?.src || !mobile?.src) {
    const available = derivatives.map((item) => ({
      width: item.width, height: item.height, type: item.type, key: item.transcodekey
    }));
    throw new Error('Required VP9 transcodes were not available. Found: ' + JSON.stringify(available));
  }

  console.log('[media] Selected desktop rendition:', desktop.width + 'x' + desktop.height, desktop.type, desktop.bandwidth ?? 'unknown bitrate');
  console.log('[media] Selected mobile rendition:', mobile.width + 'x' + mobile.height, mobile.type, mobile.bandwidth ?? 'unknown bitrate');

  const desktopPath = join(publicDir, 'plutonic-pullback-1080.webm');
  const mobilePath = join(publicDir, 'plutonic-pullback-720.webm');
  const [desktopSize, mobileSize] = await Promise.all([
    download(desktop.src, desktopPath),
    download(mobile.src, mobilePath)
  ]);

  const [desktopStat, mobileStat] = await Promise.all([stat(desktopPath), stat(mobilePath)]);
  if (desktopStat.size < 100_000 || mobileStat.size < 100_000) {
    throw new Error('Downloaded media assets failed size validation');
  }
  console.log('[media] Wrote desktop asset:', desktopSize, 'bytes');
  console.log('[media] Wrote mobile asset:', mobileSize, 'bytes');
}

main().catch((error) => {
  console.error('[media] Optimized transcodes unavailable:', error?.stack ?? error);
  // Fail the build intentionally; serving the large external original after a
  // silent asset-generation failure would recreate the playback problem.
  process.exitCode = 1;
});
