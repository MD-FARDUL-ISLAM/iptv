const tvApp = document.getElementById('tvApp');
const videoStage = document.getElementById('videoStage');
const video = document.getElementById('videoPlayer');
const channelDrawer = document.getElementById('channelDrawer');
const topBar = document.getElementById('topBar');
const infoBanner = document.getElementById('infoBanner');
const channelListEl = document.getElementById('channelList');
const playlistSelect = document.getElementById('playlistSelect');
const searchInput = document.getElementById('searchInput');
const channelCountEl = document.getElementById('channelCount');
const loader = document.getElementById('loader');
const loaderText = document.getElementById('loaderText');

const osdChNum = document.getElementById('osdChNum');
const osdLogo = document.getElementById('osdLogo');
const osdTitle = document.getElementById('osdTitle');
const osdGroup = document.getElementById('osdGroup');
const osdStatus = document.getElementById('osdStatus');
const proxyBadge = document.getElementById('proxyBadge');

const settingsModal = document.getElementById('settingsModal');
const proxyUrlInput = document.getElementById('proxyUrlInput');
const customM3uInput = document.getElementById('customM3uInput');

let allChannels = [];
let filteredChannels = [];
let currentPlayingIndex = -1;
let focusedListIndex = 0;
let hls = null;
let osdTimer = null;

let config = {
    proxyUrl: localStorage.getItem('iptv_proxy_url') || '',
    lastPlaylist: localStorage.getItem('iptv_last_playlist') || 'https://iptv-org.github.io/iptv/languages/ben.m3u'
};

const DEFAULT_LOGO = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2338bdf8'%3E%3Cpath d='M21 3H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.1-.9-2-2-2zm0 14H3V5h18v12z'/%3E%3C/svg%3E";

setInterval(() => {
    const now = new Date();
    document.getElementById('tvClock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);

function resolveStreamUrl(rawUrl) {
    if (!config.proxyUrl) return rawUrl;
    const cleanProxy = config.proxyUrl.replace(/\/$/, '');
    return `${cleanProxy}/?url=${encodeURIComponent(rawUrl)}`;
}

function parseM3U(content) {
    const lines = content.split(/\r?\n/);
    const channels = [];
    let current = null;

    for (let line of lines) {
        line = line.trim();
        if (!line) continue;
        if (line.startsWith('#EXTINF:')) {
            const info = line.substring(8);
            const nameMatch = info.match(/,(.*)$/);
            const logoMatch = info.match(/tvg-logo="([^"]*)"/i);
            const groupMatch = info.match(/group-title="([^"]*)"/i);
            current = {
                name: nameMatch ? nameMatch[1].trim() : 'Unknown Channel',
                logo: (logoMatch && logoMatch[1]) ? logoMatch[1].trim() : DEFAULT_LOGO,
                group: (groupMatch && groupMatch[1]) ? groupMatch[1].trim() : 'Live TV',
                url: ''
            };
        } else if (!line.startsWith('#') && current) {
            current.url = line;
            channels.push(current);
            current = null;
        }
    }
    return channels;
}

async function loadPlaylist(url) {
    showOSD();
    channelListEl.innerHTML = '<li style="padding:20px;text-align:center;color:#94a3b8;">Loading Channels...</li>';
    try {
        const fetchUrl = config.proxyUrl ? resolveStreamUrl(url) : url;
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error('Network error');
        const text = await res.text();
        allChannels = parseM3U(text);
        filterAndRender();
        if (filteredChannels.length > 0 && currentPlayingIndex === -1) {
            playChannelByIndex(0);
        }
    } catch (err) {
        // Fallback to direct fetch if proxied playlist fails
        try {
            const res = await fetch(url);
            const text = await res.text();
            allChannels = parseM3U(text);
            filterAndRender();
        } catch (e) {
            channelListEl.innerHTML = `<li style="padding:20px;color:#f87171;">Failed to load playlist. Check internet connection.</li>`;
        }
    }
}

function filterAndRender() {
    const q = searchInput.value.toLowerCase();
    filteredChannels = allChannels.filter(ch => ch.name.toLowerCase().includes(q) || ch.group.toLowerCase().includes(q));
    channelCountEl.textContent = `${filteredChannels.length} Channels`;
    renderChannelList();
}

function renderChannelList() {
    channelListEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const limit = filteredChannels.slice(0, 500);

    limit.forEach((ch, idx) => {
        const li = document.createElement('li');
        li.className = 'channel-item';
        if (idx === currentPlayingIndex) li.classList.add('active');
        if (idx === focusedListIndex) li.classList.add('focused');
        li.dataset.index = idx;

        li.innerHTML = `
            <span class="ch-idx">${idx + 1}</span>
            <img src="${ch.logo}" onerror="this.src='${DEFAULT_LOGO}'" alt="">
            <div class="ch-details">
                <div class="ch-title">${ch.name}</div>
                <div class="ch-sub">${ch.group}</div>
            </div>
        `;
        li.addEventListener('click', () => {
            focusedListIndex = idx;
            updateFocusVisuals();
            playChannelByIndex(idx);
            channelDrawer.classList.add('closed');
        });
        fragment.appendChild(li);
    });

    channelListEl.appendChild(fragment);
}

function updateFocusVisuals() {
    const items = channelListEl.querySelectorAll('.channel-item');
    items.forEach((item, idx) => {
        item.classList.toggle('focused', idx === focusedListIndex);
        if (idx === focusedListIndex) {
            item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    });
}

function playChannelByIndex(index) {
    if (index < 0 || index >= filteredChannels.length) return;
    currentPlayingIndex = index;
    const ch = filteredChannels[index];

    channelListEl.querySelectorAll('.channel-item').forEach((el, i) => {
        el.classList.toggle('active', i === index);
    });

    osdChNum.textContent = String(index + 1).padStart(2, '0');
    osdTitle.textContent = ch.name;
    osdGroup.textContent = ch.group;
    osdLogo.src = ch.logo;
    osdLogo.onerror = () => { osdLogo.src = DEFAULT_LOGO; };
    osdStatus.textContent = 'Connecting...';
    osdStatus.style.color = '#facc15';

    loader.classList.remove('hidden');
    loaderText.textContent = `Loading ${ch.name}...`;
    showOSD();

    const finalStreamUrl = resolveStreamUrl(ch.url);

    if (hls) {
        hls.destroy();
        hls = null;
    }

    if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 30 });
        hls.loadSource(finalStreamUrl);
        hls.attachMedia(video);

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
            loader.classList.add('hidden');
            osdStatus.textContent = 'LIVE';
            osdStatus.style.color = '#4ade80';
            video.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (e, data) => {
            if (data.fatal) {
                loader.classList.add('hidden');
                osdStatus.textContent = 'Stream Offline';
                osdStatus.style.color = '#f87171';
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = finalStreamUrl;
        video.addEventListener('loadedmetadata', () => {
            loader.classList.add('hidden');
            osdStatus.textContent = 'LIVE';
            video.play();
        });
    }
}

function hideOSDNow() {
    if (channelDrawer.classList.contains('closed') && settingsModal.classList.contains('hidden')) {
        topBar.classList.add('osd-hidden');
        infoBanner.classList.add('osd-hidden');
        tvApp.classList.add('hide-cursor');
    }
}

function showOSD() {
    topBar.classList.remove('osd-hidden');
    infoBanner.classList.remove('osd-hidden');
    tvApp.classList.remove('hide-cursor');
    clearTimeout(osdTimer);
    osdTimer = setTimeout(hideOSDNow, 3500);
}

videoStage.addEventListener('click', () => {
    if (!channelDrawer.classList.contains('closed')) {
        channelDrawer.classList.add('closed');
        showOSD();
    } else if (topBar.classList.contains('osd-hidden')) {
        showOSD();
    } else {
        hideOSDNow();
    }
});

document.addEventListener('fullscreenchange', () => {
    if (document.fullscreenElement) {
        channelDrawer.classList.add('closed');
        if (document.activeElement) document.activeElement.blur();
        showOSD();
    }
});

document.addEventListener('keydown', (e) => {
    showOSD();
    if (document.activeElement.tagName === 'INPUT') {
        if (e.key === 'Escape' || e.key === 'Enter') document.activeElement.blur();
        return;
    }
    if (!settingsModal.classList.contains('hidden')) {
        if (e.key === 'Escape' || e.key === 'Backspace') settingsModal.classList.add('hidden');
        return;
    }

    const drawerOpen = !channelDrawer.classList.contains('closed');
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            if (drawerOpen) {
                if (focusedListIndex < filteredChannels.length - 1) { focusedListIndex++; updateFocusVisuals(); }
            } else {
                playChannelByIndex((currentPlayingIndex + 1) % filteredChannels.length);
            }
            break;
        case 'ArrowUp':
            e.preventDefault();
            if (drawerOpen) {
                if (focusedListIndex > 0) { focusedListIndex--; updateFocusVisuals(); }
            } else {
                playChannelByIndex((currentPlayingIndex - 1 + filteredChannels.length) % filteredChannels.length);
            }
            break;
        case 'Enter':
            e.preventDefault();
            if (drawerOpen) { playChannelByIndex(focusedListIndex); channelDrawer.classList.add('closed'); }
            else { channelDrawer.classList.remove('closed'); }
            break;
        case 'ArrowLeft': if (!drawerOpen) channelDrawer.classList.remove('closed'); break;
        case 'ArrowRight': case 'Escape': if (drawerOpen) channelDrawer.classList.add('closed'); break;
        case 'ChannelUp': case 'PageUp': playChannelByIndex((currentPlayingIndex + 1) % filteredChannels.length); break;
        case 'ChannelDown': case 'PageDown': playChannelByIndex((currentPlayingIndex - 1 + filteredChannels.length) % filteredChannels.length); break;
        case 'm': case 'M': video.muted = !video.muted; break;
        case 'f': case 'F': toggleFullscreen(); break;
    }
});

function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
}

document.getElementById('toggleListBtn').addEventListener('click', (e) => { e.stopPropagation(); channelDrawer.classList.toggle('closed'); showOSD(); });
document.getElementById('nextChBtn').addEventListener('click', (e) => { e.stopPropagation(); playChannelByIndex((currentPlayingIndex + 1) % filteredChannels.length); });
document.getElementById('prevChBtn').addEventListener('click', (e) => { e.stopPropagation(); playChannelByIndex((currentPlayingIndex - 1 + filteredChannels.length) % filteredChannels.length); });
document.getElementById('muteBtn').addEventListener('click', (e) => { e.stopPropagation(); video.muted = !video.muted; });
document.getElementById('fullscreenBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });

playlistSelect.addEventListener('change', (e) => {
    config.lastPlaylist = e.target.value;
    localStorage.setItem('iptv_last_playlist', config.lastPlaylist);
    loadPlaylist(config.lastPlaylist);
});

searchInput.addEventListener('input', () => { focusedListIndex = 0; filterAndRender(); });

document.getElementById('settingsBtn').addEventListener('click', () => {
    proxyUrlInput.value = config.proxyUrl;
    customM3uInput.value = '';
    settingsModal.classList.remove('hidden');
});

document.getElementById('closeSettingsBtn').addEventListener('click', () => { settingsModal.classList.add('hidden'); });

document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    config.proxyUrl = proxyUrlInput.value.trim();
    if (config.proxyUrl) {
        localStorage.setItem('iptv_proxy_url', config.proxyUrl);
    } else {
        localStorage.removeItem('iptv_proxy_url');
    }
    const customUrl = customM3uInput.value.trim();
    if (customUrl) { config.lastPlaylist = customUrl; localStorage.setItem('iptv_last_playlist', customUrl); }
    settingsModal.classList.add('hidden');
    loadPlaylist(config.lastPlaylist);
});

window.addEventListener('DOMContentLoaded', () => {
    osdLogo.src = DEFAULT_LOGO;
    const exists = Array.from(playlistSelect.options).some(opt => opt.value === config.lastPlaylist);
    if (exists) playlistSelect.value = config.lastPlaylist;
    loadPlaylist(config.lastPlaylist);
});
